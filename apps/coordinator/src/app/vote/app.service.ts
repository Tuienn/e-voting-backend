import { SignBlindedVoteDto, StartSessionDto, SubmitUnblindedVoteDto } from '@libs/types/coordinator/vote.dto'
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { CONFIGURATION } from '../../configuration'
import { ClientProxy } from '@nestjs/microservices'
import { ModuleRef } from '@nestjs/core'
import { PrismaService } from '../../infrastructure/prisma/prisma.service'
import { AppService as ElectionService } from '../election/app.service'
import { v4 as uuidv4 } from 'uuid'
import { SIGNING_NODE_MESSAGE_PATTERNS } from '@libs/constants/message-patterns.constant'
import { lastValueFrom } from 'rxjs'
import {
    aggregateSignatures,
    computeCollectiveCommitment,
    computeCollectivePublicKey,
    isValidHex
} from '@libs/schnorr-blind'
import { BN } from '@libs/schnorr-blind'
import { Cache, CACHE_MANAGER } from '@nestjs/cache-manager'
import { ElectionStatus } from '../../../generated/prisma/client'
import { handlePrismaError } from '@libs/utils/handle-prisma-error.util'

type SessionSignedCache = {
    signed: boolean
    electionId: string
    voterId: string
    q: string
    signatureHex?: string
    voted: boolean
}

@Injectable()
export class AppService {
    private readonly signingNodeClients: ClientProxy[]

    constructor(
        private readonly moduleRef: ModuleRef,
        private readonly prisma: PrismaService,
        private readonly electionService: ElectionService,
        @Inject(CACHE_MANAGER) private readonly cacheManager: Cache
    ) {
        this.signingNodeClients = CONFIGURATION.COORDINATOR_CONFIG.SIGNING_NODES_TCP_NAME.map((serviceName) =>
            this.moduleRef.get<ClientProxy>(`TCP_${serviceName}`, { strict: false })
        )
    }

    async startSession(dto: StartSessionDto) {
        //SECTION- Kiểm tra election và voter có tồn tại không
        const { electionVoter, voter } = await this.electionService.getVoterInElection(dto)

        if (!voter.isActive) {
            throw new ConflictException('Voter is not active')
        }

        //SECTION- Kiểm tra voter đã vote chưa
        const existVote = await this.prisma.vote.findUnique({
            where: {
                electionId_voterId: {
                    electionId: electionVoter.electionId,
                    voterId: electionVoter.id
                }
            }
        })

        if (existVote) {
            throw new ConflictException('Voter already voted in this election')
        }

        //SECTION- Tạo session ID và gửi commitment đến các signing node
        const sessionId = uuidv4()
        const commitmentResults = await Promise.all(
            this.signingNodeClients.map((client) =>
                lastValueFrom(client.send(SIGNING_NODE_MESSAGE_PATTERNS.CREATE_COMMITMENT, { sessionId }))
            )
        )

        commitmentResults.forEach((result) => {
            if (!isValidHex(result.cI || '') || !isValidHex(result.rhoI || '')) {
                throw new BadRequestException('Invalid commitment result')
            }
        })

        //SECTION- Kiểm tra các tham số từ các signing node có khớp nhau không
        const [first, ...rest] = commitmentResults

        const isMismatch = rest.some((item) => item.p !== first.p || item.q !== first.q || item.g !== first.g)

        if (isMismatch) {
            throw new BadRequestException('Inconsistent cryptographic parameters (p, q, g) across signing nodes')
        }

        //SECTION- Tính commitment và public key tập thể
        const p = new BN(first.p, 16)
        const commitments = commitmentResults.map((r) => new BN(r.cI, 16))
        const publicKeys = commitmentResults.map((r) => new BN(r.rhoI, 16))
        const collectiveCommitment = computeCollectiveCommitment(commitments, p)
        const collectivePublicKey = computeCollectivePublicKey(publicKeys, p)

        //NOTE- Lưu sessionId chống Double-signing (1 voter 1 vote)
        await this.cacheManager.set(
            `session:signed:${sessionId}`,
            {
                signed: false,
                electionId: electionVoter.electionId,
                voterId: electionVoter.voterId,
                q: first.q,
                voted: false
            },
            CONFIGURATION.COORDINATOR_CONFIG.REDIS_CACHE_TTL
        )

        return {
            sessionId,
            collectiveCommitment: collectiveCommitment.toString(16),
            collectivePublicKey: collectivePublicKey.toString(16),
            params: {
                p: first.p,
                q: first.q,
                g: first.g
            },
            numNodes: commitmentResults.length
        }
    }

    async signBlindedVote(dto: SignBlindedVoteDto) {
        //SECTION- Kiểm tra session đã signed chưa
        const existSession = await this.cacheManager.get<SessionSignedCache>(`session:signed:${dto.sessionId}`)

        if (!existSession) {
            throw new NotFoundException('Session:sign not found or expired')
        }

        if (existSession.signed) {
            throw new ConflictException('Session:sign signed already')
        }

        //SECTION- Gửi rHex đến các signing node và nhận signature results
        const signatureResults = await Promise.all(
            this.signingNodeClients.map((client) =>
                lastValueFrom(
                    client.send(SIGNING_NODE_MESSAGE_PATTERNS.SIGN_PARTIAL, {
                        sessionId: dto.sessionId,
                        rHex: dto.rHex
                    })
                )
            )
        )

        signatureResults.forEach((result) => {
            if (!isValidHex(result.sI || '')) {
                throw new BadRequestException('Invalid signature result')
            }
        })

        //SECTION- Tính signature tập thể
        const partialSignatures = signatureResults.map((r) => new BN(r.sI, 16))
        const signature = aggregateSignatures(partialSignatures, new BN(existSession.q, 16))
        const signatureHex = signature.toString(16)

        this.cacheManager.set(
            `session:signed:${dto.sessionId}`,
            {
                signed: true,
                electionId: existSession.electionId,
                voterId: existSession.voterId,
                q: existSession.q,
                signatureHex,
                voted: false
            },
            CONFIGURATION.COORDINATOR_CONFIG.REDIS_CACHE_TTL
        )

        return {
            signatureHex
        }
    }

    async submitUnblindedVote(dto: SubmitUnblindedVoteDto) {
        //SECTION- Kiểm tra session đã signature có hợp lệ không
        const existSession = await this.cacheManager.get<SessionSignedCache>(`session:signed:${dto.sessionId}`)

        if (!existSession) {
            throw new NotFoundException('Session:sign not found or expired')
        }

        if (!existSession.signatureHex) {
            throw new ConflictException('Signature not signed yet')
        }

        if (
            existSession.signatureHex !== dto.signatureHex ||
            existSession.voterId !== dto.voterId ||
            existSession.electionId !== dto.electionId
        ) {
            throw new ConflictException('Signature, voter or election mismatch')
        }

        if (existSession.voted) {
            throw new ConflictException('Session:sign already voted')
        }

        const existElection = await this.electionService.getElectionById({ id: dto.electionId })

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        if (existElection!.status !== ElectionStatus.ACTIVE) {
            throw new ConflictException('Election is not active')
        }

        const existVote = await this.prisma.vote.findUnique({
            where: {
                electionId_voterId: {
                    electionId: dto.electionId,
                    voterId: dto.voterId
                }
            }
        })

        if (existVote) {
            throw new ConflictException('Voter already voted in this election')
        }

        try {
            const vote = await this.prisma.vote.create({
                data: {
                    electionId: dto.electionId,
                    voterId: dto.voterId,
                    blindedVoteHash: dto.bindedVoteHash,
                    revealed: false
                }
            })

            this.cacheManager.set(
                `session:signed:${dto.sessionId}`,
                {
                    ...existSession,
                    voted: true
                },
                CONFIGURATION.COORDINATOR_CONFIG.REDIS_CACHE_TTL
            )

            return vote
        } catch (e) {
            handlePrismaError(e)
        }
    }
}
