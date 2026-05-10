import {
    GetVoteByBlindedHashDto,
    SignBlindedVoteDto,
    StartSessionDto,
    SubmitBlindedVoteHashDto,
    UpdateRevealedStatusDto
} from '@libs/types/coordinator/vote.dto'
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common'
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
    getParams,
    hexToPoint,
    hexToScalar,
    isValidPointHex,
    isValidScalarHex,
    pointToHex
} from '@libs/ec-schnorr'
import { MongoIdDto } from '@libs/types/common.dto'

type SessionSignedCache = {
    signed: boolean
    electionId: string
    voterId: string
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

        //NOTE - Lưu sessionId chống Double-signing (1 voter 1 vote)
        await this.cacheManager.set(
            `session:signed:${sessionId}`,
            {
                signed: false,
                electionId: electionVoter.electionId,
                voterId: electionVoter.voterId,
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

    async signBlindedVote(dto: SignBlindedVoteDto) {
        //SECTION - Kiểm tra session đã signed chưa
        const existSession = await this.cacheManager.get<SessionSignedCache>(`session:signed:${dto.sessionId}`)

        if (!existSession) {
            throw new NotFoundException('Session:sign not found or expired')
        }

        if (existSession.signed) {
            throw new ConflictException('Session:sign signed already')
        }

        const ecParams = getParams()

        //SECTION - Gửi rHex đến các signing node và nhận signature results
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
            if (!isValidScalarHex(result.sI || '', ecParams.n)) {
                throw new BadRequestException('Invalid signature result')
            }
        })

        //SECTION - Tính signature tập thể
        const partialSignatures = signatureResults.map((r) => hexToScalar(r.sI))
        const signature = aggregateSignatures(partialSignatures, ecParams)
        const signatureHex = signature.toString(16)

        this.cacheManager.set(
            `session:signed:${dto.sessionId}`,
            {
                signed: true,
                electionId: existSession.electionId,
                voterId: existSession.voterId,
                signatureHex,
                voted: false
            },
            CONFIGURATION.COORDINATOR_CONFIG.REDIS_SESSION_CACHE_TTL
        )

        return {
            signatureHex
        }
    }

    async submitBlindedVoteHash(dto: SubmitBlindedVoteHashDto) {
        //SECTION - Kiểm tra session đã signature có hợp lệ không
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

        await this.electionService.checkActiveElectionById({ id: dto.electionId })

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
                    blindedVoteHash: dto.blindedVoteHash,
                    revealed: false
                }
            })

            this.cacheManager.set(
                `session:signed:${dto.sessionId}`,
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

    async getVoteByBlindedHash(dto: GetVoteByBlindedHashDto) {
        return await this.prisma.vote.findUnique({
            where: {
                electionId_blindedVoteHash: {
                    electionId: dto.electionId,
                    blindedVoteHash: dto.blindedVoteHash
                }
            }
        })
    }

    async checkExistUnrevealedVote(dto: MongoIdDto): Promise<boolean> {
        const remainingUnrevealedVote = await this.prisma.vote.findFirst({
            where: {
                electionId: dto.id,
                revealed: false
            },
            select: { id: true }
        })

        return !!remainingUnrevealedVote
    }

    async updateRevealedStatus(dto: UpdateRevealedStatusDto) {
        const vote = await this.getVoteByBlindedHash({
            electionId: dto.electionId,
            blindedVoteHash: dto.blindedVoteHash
        })

        if (!vote) {
            throw new NotFoundException('Vote not found')
        }

        await this.prisma.vote.update({
            where: {
                electionId_blindedVoteHash: {
                    electionId: dto.electionId,
                    blindedVoteHash: dto.blindedVoteHash
                }
            },
            data: {
                revealed: true
            }
        })
    }
}
