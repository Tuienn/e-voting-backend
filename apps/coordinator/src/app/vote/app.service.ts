import { SignBlindedVoteDto, StartSessionDto, SubmitBlindedCommitmentDto } from '@libs/types/coordinator/vote.dto'
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { MongoIdDto } from '@libs/types/common.dto'
import { CONFIGURATION } from '../../configuration'
import { ClientProxy } from '@nestjs/microservices'
import { ModuleRef } from '@nestjs/core'
import { PrismaService } from '../../infrastructure/prisma/prisma.service'
import { AppService as ElectionService } from '../election/app.service'
import { v4 as uuidv4 } from 'uuid'
import { SIGNING_NODE_MESSAGE_PATTERNS } from '@libs/constants/message-patterns.constant'
import { lastValueFrom } from 'rxjs'
import { Cache, CACHE_MANAGER } from '@nestjs/cache-manager'
import { handlePrismaError } from '@libs/utils/handle-prisma-error.util'
import {
    aggregateSignatures,
    computeCollectiveCommitment,
    computeCollectivePublicKey,
    EcParams,
    getParams,
    hexToPoint,
    hexToScalar,
    isValidPointHex,
    isValidScalarHex,
    pointToHex,
    scalarToHex
} from '@libs/ec-schnorr'

type SessionSignedCache = {
    sessionId: string
    signed: boolean
    electionId: string
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

    async getVoteCount(dto: MongoIdDto): Promise<number> {
        const cached = await this.cacheManager.get<number>(`election:vote:count:${dto.id}`)
        if (cached !== null && cached !== undefined) return cached

        return await this.prisma.vote.count({ where: { electionId: dto.id } })
    }

    async startSession(dto: StartSessionDto) {
        await this.electionService.checkActiveElectionById({ id: dto.electionId })

        //SECTION - Kiểm tra election và voter có tồn tại không
        const { electionVoter, voter } = await this.electionService.getVoterInElection(dto)

        if (!voter.isActive) {
            throw new ConflictException('Voter is not active')
        }

        //SECTION - Kiểm tra voter đã vote chưa
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

        const existSession = await this.cacheManager.get<SessionSignedCache>(`session:signed:${dto.voterId}`)
        if (existSession) {
            //SECTION - Nếu session đã tồn tại, xóa session nonce trên signing node để tránh Nonce reuse (tấn công phục hồi private key) khi user start session lần 2
            this.signingNodeClients.map((client) =>
                client
                    .emit(SIGNING_NODE_MESSAGE_PATTERNS.DELETE_SESSION_NONCE, {
                        sessionId: existSession.sessionId
                    })
                    .subscribe()
            )
        }

        //SECTION - Tạo session ID và gửi commitment đến các signing node
        const sessionId = uuidv4()
        const ecParams = getParams()

        const commitmentResults = await Promise.all(
            this.signingNodeClients.map((client) =>
                lastValueFrom(client.send(SIGNING_NODE_MESSAGE_PATTERNS.CREATE_COMMITMENT, { sessionId }))
            )
        )

        commitmentResults.forEach((result) => {
            if (
                !isValidPointHex(result.cI || '', ecParams.Point) ||
                !isValidPointHex(result.rhoI || '', ecParams.Point)
            ) {
                throw new BadRequestException('Invalid commitment result')
            }
        })

        //SECTION - Tính commitment và public key tập thể
        const commitments = commitmentResults.map((r) => hexToPoint(r.cI, ecParams))
        const publicKeys = commitmentResults.map((r) => hexToPoint(r.rhoI, ecParams))
        const collectiveCommitment = computeCollectiveCommitment(commitments, ecParams)
        const collectivePublicKey = computeCollectivePublicKey(publicKeys, ecParams)

        //NOTE - Lưu sessionId theo voterId chống Double-signing (1 voter 1 vote)
        await this.cacheManager.set(
            `session:signed:${dto.voterId}`,
            {
                sessionId: sessionId,
                signed: false,
                electionId: electionVoter.electionId,
                voted: false
            },
            CONFIGURATION.COORDINATOR_CONFIG.REDIS_SESSION_CACHE_TTL
        )

        return {
            sessionId,
            collectiveCommitment: pointToHex(collectiveCommitment),
            collectivePublicKey: pointToHex(collectivePublicKey),
            numNodes: commitmentResults.length
        }
    }

    async signBlindedVote(dto: SignBlindedVoteDto, ecParams: EcParams) {
        //SECTION - Kiểm tra session đã signed chưa
        const existSession = await this.cacheManager.get<SessionSignedCache>(`session:signed:${dto.voterId}`)

        if (!existSession) {
            throw new NotFoundException('Session:sign not found or expired')
        }

        if (existSession.signed) {
            throw new ConflictException('Session:sign signed already')
        }

        //SECTION - Gửi rHex đến các signing node và nhận signature results.
        // Truyền (electionId, voterId) để signing-node persist dedup theo cặp
        // này → chống voter tích lũy nhiều chữ ký bằng nhiều session khi cache hết hạn.
        const signatureResults = await Promise.all(
            this.signingNodeClients.map((client) =>
                lastValueFrom(
                    client.send(SIGNING_NODE_MESSAGE_PATTERNS.SIGN_PARTIAL, {
                        sessionId: dto.sessionId,
                        rHex: dto.rHex,
                        electionId: existSession.electionId,
                        voterId: dto.voterId
                    })
                )
            )
        )

        signatureResults.forEach((result) => {
            if (!isValidScalarHex(result.sI || '', ecParams.n)) {
                throw new BadRequestException('Invalid signature result')
            }
        })

        //SE    CTION - Tính signature tập thể
        const partialSignatures = signatureResults.map((r) => hexToScalar(r.sI))
        const signature = aggregateSignatures(partialSignatures, ecParams)
        const signatureHex = scalarToHex(signature)

        this.cacheManager.set(
            `session:signed:${dto.voterId}`,
            {
                sessionId: existSession.sessionId,
                signed: true,
                electionId: existSession.electionId,
                signatureHex,
                voted: false
            },
            CONFIGURATION.COORDINATOR_CONFIG.REDIS_SESSION_CACHE_TTL
        )

        return {
            signatureHex
        }
    }

    async submitBlindedCommitment(dto: SubmitBlindedCommitmentDto) {
        //SECTION - Kiểm tra session đã signature có hợp lệ không
        const existSession = await this.cacheManager.get<SessionSignedCache>(`session:signed:${dto.voterId}`)

        if (!existSession) {
            throw new NotFoundException('Session:sign not found or expired')
        }

        if (!existSession.signatureHex) {
            throw new ConflictException('Signature not signed yet')
        }

        if (
            existSession.signatureHex !== dto.signatureHex ||
            existSession.sessionId !== dto.sessionId ||
            existSession.electionId !== dto.electionId
        ) {
            throw new ConflictException('Signature, session or election mismatch')
        }

        if (existSession.voted) {
            throw new ConflictException('Session:sign already voted')
        }

        await this.electionService.checkActiveElectionById({ id: dto.electionId })

        try {
            const vote = await this.prisma.$transaction(async (tx) => {
                const existVote = await tx.vote.findUnique({
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

                return await tx.vote.create({
                    data: {
                        electionId: dto.electionId,
                        voterId: dto.voterId,
                        blindedCommitment: dto.blindedCommitment
                    }
                })
            })

            this.cacheManager.set(
                `session:signed:${dto.voterId}`,
                {
                    ...existSession,
                    voted: true
                },
                CONFIGURATION.COORDINATOR_CONFIG.REDIS_SESSION_CACHE_TTL
            )

            return vote
        } catch (e) {
            handlePrismaError(e)
        }
    }
}
