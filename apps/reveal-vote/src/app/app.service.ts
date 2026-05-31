import { handlePrismaError } from '@libs/utils/handle-prisma-error.util'
import {
    COORDINATOR_MESSAGE_PATTERNS,
    IDENTITY_MESSAGE_PATTERNS,
    SOCKET_EVENT_PATTERNS
} from '@libs/constants/message-patterns.constant'
import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Inject,
    Injectable,
    Logger,
    NotFoundException
} from '@nestjs/common'
import { PrismaService } from '../infrastructure/prisma/prisma.service'
import { RevealVoteDto } from '@libs/types/reveal-vote/app.dto'
import {
    EcParams,
    SCALAR_BYTES,
    bytesToHex,
    hexToPoint,
    hexToScalar,
    scalarToBuffer,
    sha256,
    verify
} from '@libs/ec-schnorr'
import { CONFIGURATION } from '../configuration'
import { ClientProxy } from '@nestjs/microservices'
import { lastValueFrom } from 'rxjs'
import { buildVoteMessage, computeRevealPayloadHash } from '@libs/utils/vote-handler.util'
import { FabricClientService } from '@libs/fabric'
import { MongoIdDto } from '@libs/types/common.dto'

@Injectable()
export class AppService {
    private readonly logger = new Logger(AppService.name)

    constructor(
        private readonly prisma: PrismaService,
        @Inject(`TCP_${CONFIGURATION.REVEAL_VOTE_CONFIG.COORDINATOR_TCP_NAME}`)
        private readonly coordinatorClient: ClientProxy,
        @Inject(`TCP_${CONFIGURATION.REVEAL_VOTE_CONFIG.IDENTITY_TCP_NAME}`)
        private readonly identityClient: ClientProxy,
        private readonly fabricClient: FabricClientService,
        @Inject('EVENT_BUS') private readonly eventBus: ClientProxy
    ) {}

    private computeRevealKey(h: bigint, sPrime: bigint): string {
        const buf = new Uint8Array(SCALAR_BYTES * 2)
        buf.set(scalarToBuffer(h), 0)
        buf.set(scalarToBuffer(sPrime), SCALAR_BYTES)
        return bytesToHex(sha256(buf))
    }

    private async triggerCompleteElectionIfAllRevealed(electionId: string): Promise<boolean> {
        const [revealCount, voteCount] = await Promise.all([
            this.prisma.revealedVote.count({ where: { electionId } }),
            lastValueFrom(
                this.coordinatorClient.send(COORDINATOR_MESSAGE_PATTERNS.GET_VOTE_COUNT, { id: electionId })
            ) as Promise<number>
        ])

        if (voteCount > 0 && revealCount >= voteCount) {
            await lastValueFrom(
                this.coordinatorClient.send(COORDINATOR_MESSAGE_PATTERNS.COMPLETE_ELECTION, { id: electionId })
            )
            this.logger.debug(`Election ${electionId} auto-completed: ${revealCount}/${voteCount} votes revealed`)

            return true
        }
        return false
    }

    async revealVote(dto: RevealVoteDto, ecParams: EcParams) {
        //SECTION - Kiểm tra election
        const existElection = await lastValueFrom(
            this.coordinatorClient.send(COORDINATOR_MESSAGE_PATTERNS.GET_ELECTION_BY_ID, {
                id: dto.electionId
            })
        )

        if (!existElection) {
            throw new NotFoundException('Election not found')
        }

        if (existElection.status === 'COMPLETED') {
            throw new ForbiddenException('Election is already completed')
        }

        if (existElection.status !== 'CLOSED') {
            throw new ForbiddenException('Election is not closed')
        }

        if (!existElection.collectivePublicKey) {
            throw new ConflictException('Election must has collectivePublicKey to reveal')
        }

        if (!existElection.candidateIds.includes(dto.candidateId)) {
            throw new ForbiddenException('Candidate is not in the election')
        }

        const h = hexToScalar(dto.h)
        const sPrime = hexToScalar(dto.sPrime)
        const rho = hexToPoint(existElection.collectivePublicKey, ecParams)

        //SECTION - Kiểm tra signature,  Đây là điểm tin cậy duy nhất: chữ ký tập thể chỉ có thể được tạo qua phiên blind sign hợp lệ.
        // Bind electionId vào message để chống cross-election replay: chữ ký
        // hợp lệ trong election A không verify được trong election B vì message
        // khác nhau. Client phải dùng cùng buildVoteMessage(electionId, candidateId)
        // ở pha blind.
        const messageBuf = buildVoteMessage(dto.electionId, dto.candidateId)
        const isValidSignature = verify(messageBuf, h, sPrime, ecParams, rho)

        if (!isValidSignature) {
            throw new BadRequestException('Invalid signature')
        }

        //SECTION - Tính blindedVoteHash
        const revealKey = this.computeRevealKey(h, sPrime)

        //SECTION - Kiểm tra blindedVoteHash có tồn tại trong db kchống anti-replay attack
        try {
            //SECTION - Commit on chain
            const revealPayloadHash = computeRevealPayloadHash(dto.candidateId, dto.h, dto.sPrime)
            const fabricRes = await this.fabricClient.revealVote(
                dto.electionId,
                dto.candidateId,
                revealKey,
                revealPayloadHash
            )

            //NOTE - revealedVote có @@unique([electionId, revealKey]) đã đảm bảo auto validate chống replay
            const revealedVote = await this.prisma.revealedVote.create({
                data: {
                    electionId: dto.electionId,
                    candidateId: dto.candidateId,
                    revealKey,
                    signature: {
                        h: dto.h,
                        sPrime: dto.sPrime
                    },
                    blockchainRef: fabricRes.result.transactionId
                },
                omit: {
                    signature: true
                }
            })
            //SECTION - Auto-transition closed → completed khi mọi phiếu đã reveal
            const electionCompleted =
                (await this.triggerCompleteElectionIfAllRevealed(dto.electionId).catch((err) =>
                    this.logger.error(`Auto-complete election ${dto.electionId} failed: ${err?.message}`)
                )) ?? false

            //NOTE - Publish event realtime tới socket gateway qua Redis Pub/Sub (fire-and-forget, không await, lỗi broker không làm hỏng luồng reveal và không tạo unhandled rejection)
            this.eventBus
                .emit(SOCKET_EVENT_PATTERNS.VOTE_REVEALED, {
                    electionId: revealedVote.electionId,
                    candidateId: revealedVote.candidateId,
                    revealKey: revealedVote.revealKey,
                    blockchainRef: revealedVote.blockchainRef,
                    //NOTE - Model RevealedVote dùng field revealedAt, map sang createdAt cho đúng contract socket
                    createdAt: revealedVote.revealedAt,
                    electionCompleted
                })
                .subscribe({
                    error: (err) =>
                        this.logger.error(`Emit ${SOCKET_EVENT_PATTERNS.VOTE_REVEALED} failed: ${err?.message}`)
                })

            return { ...revealedVote, electionCompleted }
        } catch (e) {
            handlePrismaError(e, [{ code: 'P2002', message: 'This vote has already been revealed' }])
        }
    }

    //NOTE - So sánh số vote/reveal trong MongoDB với số vote/reveal trên Fabric, đồng thời cho biết Merkle root đã commit chưa.
    async getAuditVote(dto: MongoIdDto) {
        //SECTION - Kiểm tra election
        const existElection = await lastValueFrom(
            this.coordinatorClient.send(COORDINATOR_MESSAGE_PATTERNS.GET_ELECTION_BY_ID, {
                id: dto.id
            })
        )

        if (!existElection) {
            throw new NotFoundException('Election not found')
        }

        const [dbRevealVoteCount, dbVoteCount, fabricRes] = await Promise.all([
            //SECTION - Đếm số phiếu trong db
            this.prisma.revealedVote.count({ where: { electionId: dto.id } }),
            lastValueFrom(this.coordinatorClient.send(COORDINATOR_MESSAGE_PATTERNS.GET_VOTE_COUNT, { id: dto.id })),

            //SECTION - Get audit data from blockchain
            this.fabricClient.getAuditCounts(dto.id)
        ])

        //NOTE - Xem type ở chainlaunch/chaincode/types.go để biết format của result (AuditCountsView)
        const chainData = fabricRes.result ? JSON.parse(fabricRes.result) : null

        return {
            electionId: dto.id,
            electionName: existElection.name,
            status: existElection.status,
            db: {
                voteCount: dbVoteCount,
                revealCount: dbRevealVoteCount
            },
            chain: chainData
                ? {
                      voteCount: chainData.totalVoteCount,
                      revealCount: chainData.revealCount,
                      rootCommitted: chainData.rootCommitted
                  }
                : null,
            chainError: chainData ? null : fabricRes.message || 'Failed to get data from blockchain'
        }
    }

    //NOTE - Công bố kết quả đếm phiếu đã reveal theo từng candidate sau khi election đã closed hoặc completed
    async getTallyResult(dto: MongoIdDto) {
        const existElection = await lastValueFrom(
            this.coordinatorClient.send(COORDINATOR_MESSAGE_PATTERNS.GET_ELECTION_BY_ID, { id: dto.id })
        )
        if (!existElection) throw new NotFoundException('Election not found')
        if (existElection.status !== 'CLOSED' && existElection.status !== 'COMPLETED') {
            throw new ForbiddenException('Election is not closed or completed')
        }

        const [dbGroups, fabricRes, candidateNames] = await Promise.all([
            this.prisma.revealedVote.groupBy({
                by: ['candidateId'],
                where: { electionId: dto.id },
                _count: { candidateId: true }
            }),
            this.fabricClient.getTallyResult(dto.id),
            //SECTION - Lấy tên candidate từ identity service
            lastValueFrom(
                this.identityClient.send(IDENTITY_MESSAGE_PATTERNS.GET_USERS_BY_IDS, {
                    ids: existElection.candidateIds,
                    role: 'CANDIDATE'
                })
            ) as Promise<{ id: string; name: string }[]>
        ])

        const chainData = fabricRes.result ? JSON.parse(fabricRes.result) : null

        //SECTION - Build từ toàn bộ candidateIds, kể cả 0 phiếu
        const dbMap = new Map(dbGroups.map((g) => [g.candidateId, g._count.candidateId]))
        const nameMap = new Map(candidateNames.map((c) => [c.id, c.name]))

        let dbRevealTotal = 0
        let chainRevealTotal = 0

        //SECTION - Tally result theo từng candidate, đồng thời tính tổng reveal để so sánh với blockchain.
        // Nếu có candidate nào không tồn tại trong dbMap thì count = 0
        const tallyResult = existElection.candidateIds.map((candidateId: string) => {
            const dbRevealCount = dbMap.get(candidateId) ?? 0
            const chainRevealCount = chainData?.tally?.[candidateId] ?? 0
            dbRevealTotal += dbRevealCount
            chainRevealTotal += chainRevealCount
            return {
                candidateId,
                candidateName: nameMap.get(candidateId) ?? null,
                dbRevealCount,
                chainRevealCount
            }
        })

        return {
            electionId: dto.id,
            electionName: existElection.name,
            status: existElection.status,
            tallyResult,
            dbRevealTotal,
            chainRevealTotal: chainRevealTotal,
            chainError: chainData ? null : fabricRes.message || 'Failed to get data from blockchain'
        }
    }
}
