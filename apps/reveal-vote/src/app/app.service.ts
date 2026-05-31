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
import { buildVoteMessage, canonicalizeCandidateIds, computeRevealPayloadHash } from '@libs/utils/vote-handler.util'
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

        //SECTION - Canonical hoá + validate danh sách ứng viên (enforce ở backend)
        const candidateIds = canonicalizeCandidateIds(dto.candidateIds)
        if (!candidateIds.every((id) => existElection.candidateIds.includes(id))) {
            throw new ForbiddenException('Candidate is not in the election')
        }
        const maxSelectable = existElection.maxSelectableCandidates ?? 1
        if (candidateIds.length > maxSelectable) {
            throw new ForbiddenException(`Cannot select more than ${maxSelectable} candidate(s)`)
        }

        const h = hexToScalar(dto.h)
        const sPrime = hexToScalar(dto.sPrime)
        const rho = hexToPoint(existElection.collectivePublicKey, ecParams)

        //SECTION - Kiểm tra signature,  Đây là điểm tin cậy duy nhất: chữ ký tập thể chỉ có thể được tạo qua phiên blind sign hợp lệ.
        // Bind electionId vào message để chống cross-election replay: chữ ký
        // hợp lệ trong election A không verify được trong election B vì message
        // khác nhau. Client phải dùng cùng buildVoteMessage(electionId, candidateIds)
        // với cùng quy ước canonical ở pha blind.
        const messageBuf = buildVoteMessage(dto.electionId, candidateIds)
        const isValidSignature = verify(messageBuf, h, sPrime, ecParams, rho)

        if (!isValidSignature) {
            throw new BadRequestException('Invalid signature')
        }

        //SECTION - Tính blindedVoteHash
        const revealKey = this.computeRevealKey(h, sPrime)

        //SECTION - Commit on chain trước (Option B: GIỮ thứ tự chain-first, không đổi)
        //NOTE - candidateIdsJson là chuỗi canonical DUY NHẤT dùng cho cả hash và arg chaincode
        const candidateIdsJson = JSON.stringify(candidateIds)
        const revealPayloadHash = computeRevealPayloadHash(candidateIds, dto.h, dto.sPrime)

        let blockchainRef: string | null
        try {
            const fabricRes = await this.fabricClient.revealVote(
                dto.electionId,
                candidateIdsJson,
                revealKey,
                revealPayloadHash
            )
            blockchainRef = fabricRes.result.transactionId
        } catch (chainErr) {
            //NOTE - Option B: revealVote invoke fail có thể là (a) lỗi thật, hoặc (b) retry sau partial-fail
            // (lần trước chain ĐÃ ghi revealKey nhưng DB chưa kịp lưu → voter retry bị chain reject "revealKey already used").
            // Query GetUsedReveal để phân định, chain là nguồn sự thật.
            const usedRes = await this.fabricClient.getUsedReveal(dto.electionId, revealKey)

            if (!usedRes.result) {
                //NOTE - chain CHƯA có revealKey → đây là lỗi thật, ném tiếp
                throw chainErr
            }

            //NOTE - chain ĐÃ có revealKey. Xác thực candidateIds on-chain khớp request để không ghi nhầm phiếu.
            // chaincode trả candidateIds theo đúng thứ tự canonical đã lưu ⇒ so sánh trực tiếp chuỗi JSON canonical.
            const used = JSON.parse(usedRes.result)
            if (JSON.stringify(used.candidateIds) !== candidateIdsJson) {
                throw new ConflictException('Reveal key already used for different candidates on chain')
            }

            //NOTE - Recover: GetUsedReveal KHÔNG trả txId nên blockchainRef = null. Bước create bên dưới sẽ:
            // - thành công nếu DB chưa có record (đúng ca partial-fail) → phiếu được phục hồi
            // - ném P2002 nếu DB đã có (replay thật) → "This vote has already been revealed"
            blockchainRef = null
        }

        //SECTION - Ghi DB chống anti-replay. @@unique([electionId, revealKey]) vừa chống replay vừa đảm bảo idempotent recovery.
        try {
            //NOTE - revealedVote có @@unique([electionId, revealKey]) đã đảm bảo auto validate chống replay
            const revealedVote = await this.prisma.revealedVote.create({
                data: {
                    electionId: dto.electionId,
                    candidateIds,
                    revealKey,
                    signature: {
                        h: dto.h,
                        sPrime: dto.sPrime
                    },
                    blockchainRef
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
                    candidateIds: revealedVote.candidateIds,
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

        const [dbGroups, dbRevealedBallots, tallyRes, auditRes, candidateNames] = await Promise.all([
            //NOTE - groupBy không unwind được mảng candidateIds ⇒ dùng aggregateRaw: $unwind rồi $group đếm từng candidate
            this.prisma.revealedVote.aggregateRaw({
                pipeline: [
                    { $match: { electionId: { $oid: dto.id } } },
                    { $unwind: '$candidateIds' },
                    { $group: { _id: '$candidateIds', count: { $sum: 1 } } }
                ]
            }) as unknown as Promise<{ _id: { $oid: string } | string; count: number }[]>,
            //NOTE - Số PHIẾU (ballots) đã reveal trong DB = số document (1 doc/ballot), khác tổng lượt chọn
            this.prisma.revealedVote.count({ where: { electionId: dto.id } }),
            //NOTE - GetTally trả map candidateId -> count ⇒ tổng = số LƯỢT CHỌN (selections) trên chain
            this.fabricClient.getTallyResult(dto.id),
            //NOTE - GetAuditCounts trả revealCount = số PHIẾU (ballots) đã reveal trên chain (1 lần/ballot)
            this.fabricClient.getAuditCounts(dto.id),
            //SECTION - Lấy tên candidate từ identity service
            lastValueFrom(
                this.identityClient.send(IDENTITY_MESSAGE_PATTERNS.GET_USERS_BY_IDS, {
                    ids: existElection.candidateIds,
                    role: 'CANDIDATE'
                })
            ) as Promise<{ id: string; name: string }[]>
        ])

        const chainTally = tallyRes.result ? JSON.parse(tallyRes.result) : null
        const chainAudit = auditRes.result ? JSON.parse(auditRes.result) : null

        //SECTION - Build từ toàn bộ candidateIds, kể cả 0 phiếu.
        //NOTE - aggregateRaw trả ObjectId dạng extended JSON { $oid }, cần unwrap về string
        const dbMap = new Map(dbGroups.map((g) => [typeof g._id === 'string' ? g._id : g._id.$oid, g.count]))
        const nameMap = new Map(candidateNames.map((c) => [c.id, c.name]))

        let dbTotalSelections = 0
        let chainTotalSelections = 0

        //SECTION - Tally result theo từng candidate, đồng thời cộng dồn TỔNG LƯỢT CHỌN (selections) 2 phía.
        // Nếu có candidate nào không tồn tại trong dbMap thì count = 0
        const tallyResult = existElection.candidateIds.map((candidateId: string) => {
            const dbRevealCount = dbMap.get(candidateId) ?? 0
            const chainRevealCount = chainTally?.tally?.[candidateId] ?? 0
            dbTotalSelections += dbRevealCount
            chainTotalSelections += chainRevealCount
            return {
                candidateId,
                candidateName: nameMap.get(candidateId) ?? null,
                dbRevealCount,
                chainRevealCount
            }
        })

        //NOTE - Số PHIẾU đã reveal trên chain (1 lần/ballot). Khác tổng lượt chọn khi bầu nhiều ứng viên.
        const chainRevealedBallots = chainAudit?.revealCount ?? 0

        return {
            electionId: dto.id,
            electionName: existElection.name,
            status: existElection.status,
            tallyResult,
            //NOTE - 4 con số tách bạch:
            // - revealedBallots = SỐ PHIẾU đã reveal (mỗi lá phiếu đếm đúng 1 lần)
            // - totalSelections = TỔNG LƯỢT CHỌN (mỗi lượt chọn ứng viên đếm 1 lần; >= số phiếu khi multi-select)
            // Mỗi chỉ số có 2 nguồn: db (MongoDB) và chain (Fabric).
            dbRevealedBallots,
            chainRevealedBallots,
            dbTotalSelections,
            chainTotalSelections,
            chainError:
                chainTally && chainAudit
                    ? null
                    : tallyRes.message || auditRes.message || 'Failed to get data from blockchain'
        }
    }
}
