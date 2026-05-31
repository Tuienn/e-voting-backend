import {
    FilterVotesDto,
    SignBlindedVoteDto,
    StartSessionDto,
    SubmitBlindedCommitmentDto,
    VerifyVoteDto
} from '@libs/types/coordinator/vote.dto'
import {
    BadRequestException,
    ConflictException,
    forwardRef,
    Inject,
    Injectable,
    Logger,
    NotFoundException
} from '@nestjs/common'
import { MongoIdDto } from '@libs/types/common.dto'
import { CONFIGURATION } from '../../configuration'
import { ClientProxy } from '@nestjs/microservices'
import { ModuleRef } from '@nestjs/core'
import { PrismaService } from '../../infrastructure/prisma/prisma.service'
import { AppService as ElectionService } from '../election/app.service'
import { v4 as uuidv4 } from 'uuid'
import { ObjectId } from 'bson'
import {
    IDENTITY_MESSAGE_PATTERNS,
    SIGNING_NODE_MESSAGE_PATTERNS,
    SOCKET_EVENT_PATTERNS
} from '@libs/constants/message-patterns.constant'
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
import { ElectionStatus, VoteStatus } from '../../../generated/prisma/enums'
import { computeCommitmentProof, FabricClientService, verifyCommitmentProof } from '@libs/fabric'
import { removeUndefinedObj } from '@libs/utils/object.util'
import { PaginationMeta } from '@libs/types/common.type'
import { Vote } from '../../../generated/prisma/client'

type SessionSignedCache = {
    sessionId: string
    signed: boolean
    electionId: string
    signatureHex?: string
    voted: boolean
}

@Injectable()
export class AppService {
    private readonly logger = new Logger(AppService.name)
    private readonly signingNodeClients: ClientProxy[]

    constructor(
        private readonly moduleRef: ModuleRef,
        private readonly prisma: PrismaService,
        @Inject(`TCP_${CONFIGURATION.COORDINATOR_CONFIG.IDENTITY_TCP_NAME}`)
        private readonly identityClient: ClientProxy,
        @Inject(forwardRef(() => ElectionService)) private readonly electionService: ElectionService,
        @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
        private readonly fabricClientService: FabricClientService,
        @Inject('EVENT_BUS') private readonly eventBus: ClientProxy
    ) {
        this.signingNodeClients = CONFIGURATION.COORDINATOR_CONFIG.SIGNING_NODES_TCP_NAME.map((serviceName) =>
            this.moduleRef.get<ClientProxy>(`TCP_${serviceName}`, { strict: false })
        )
    }

    async getVoteCount(dto: MongoIdDto): Promise<number> {
        const cached = await this.cacheManager.get<number>(`election:vote:count:${dto.id}`)
        if (cached !== null && cached !== undefined) return cached

        //NOTE - Chỉ đếm vote đã CONFIRMED để khớp với stats.TotalVoteCount trên chain (PENDING_CHAIN chưa chắc đã lên chain)
        return await this.prisma.vote.count({ where: { electionId: dto.id, status: VoteStatus.CONFIRMED } })
    }

    async filterVotes(dto: FilterVotesDto): Promise<
        {
            data: (Pick<Vote, 'id' | 'electionId' | 'voterId' | 'blindedCommitment' | 'blockchainRef' | 'createdAt'> & {
                voter: { id: string; email: string; name: string } | null
            })[]
        } & PaginationMeta & { totalVoters: number }
    > {
        const { electionId, voterId, startDate, endDate, page = 0, pageSize = 10 } = dto ?? {}
        const voteSelect = {
            id: true,
            electionId: true,
            voterId: true,
            blindedCommitment: true,
            blockchainRef: true,
            createdAt: true
        }
        const fromDate = startDate ? new Date(startDate) : undefined
        const toDate = endDate ? new Date(endDate) : undefined
        let votes: Pick<Vote, 'id' | 'electionId' | 'voterId' | 'blindedCommitment' | 'blockchainRef' | 'createdAt'>[]
        let total: number

        if (voterId) {
            // Mỗi voter tối đa 1 vote trong 1 election. Mặc định chỉ lấy vote đã CONFIRMED (đã có trên blockchain);
            // dùng findFirst thay findUnique để lọc thêm theo status.
            const vote = await this.prisma.vote.findFirst({
                where: {
                    electionId,
                    voterId,
                    status: VoteStatus.CONFIRMED
                },
                select: voteSelect
            })

            const filteredVotes =
                vote && (!fromDate || vote.createdAt >= fromDate) && (!toDate || vote.createdAt <= toDate) ? [vote] : []

            total = filteredVotes.length
            votes = filteredVotes.slice(page * pageSize, page * pageSize + pageSize)
        } else {
            const where = removeUndefinedObj({
                electionId,
                // Mặc định chỉ liệt kê vote đã CONFIRMED (đã có trên blockchain)
                status: VoteStatus.CONFIRMED,
                createdAt:
                    fromDate || toDate
                        ? removeUndefinedObj({
                              gte: fromDate,
                              lte: toDate
                          })
                        : undefined
            })

            const [data, count] = await this.prisma.$transaction([
                this.prisma.vote.findMany({
                    where,
                    orderBy: { createdAt: 'desc' },
                    select: voteSelect,
                    skip: page * pageSize,
                    take: pageSize
                }),
                this.prisma.vote.count({ where })
            ])

            votes = data
            total = count
        }

        const voterIds = [...new Set(votes.map((vote) => vote.voterId))]
        const voters =
            voterIds.length > 0
                ? await lastValueFrom(
                      this.identityClient.send(IDENTITY_MESSAGE_PATTERNS.GET_USERS_BY_IDS, {
                          ids: voterIds,
                          role: 'VOTER'
                      })
                  )
                : []
        const voterMap = new Map(
            (voters as { id: string; email: string; name: string }[]).map((voter) => [voter.id, voter])
        )

        const totalVoters = await this.prisma.electionVoter.count({ where: { electionId } })

        return {
            data: votes.map((vote) => ({
                ...vote,
                voter: voterMap.get(vote.voterId) ?? null
            })),
            totalPages: Math.ceil(total / pageSize),
            currentPage: page,
            pageSize,
            total,
            totalVoters
        }
    }

    async startSession(dto: StartSessionDto) {
        const existElection = await this.electionService.getElectionById({ id: dto.electionId })

        if (!existElection) {
            throw new NotFoundException('Election not found')
        }

        if (existElection.status !== ElectionStatus.ACTIVE) {
            throw new BadRequestException('Election is not active')
        }

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
            },
            select: { id: true }
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
                lastValueFrom(
                    client.send(SIGNING_NODE_MESSAGE_PATTERNS.CREATE_COMMITMENT, {
                        sessionId,
                        electionId: dto.electionId
                    })
                )
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
        const collectivePublicKeyHex = pointToHex(collectivePublicKey)

        //SECTION - Kiểm tra collective public key có khớp với election không, chống giả mạo session để lấy chữ ký hợp lệ cho election khác (cross-election replay attack)
        if (collectivePublicKeyHex !== existElection.collectivePublicKey) {
            throw new BadRequestException('Collective public key mismatch')
        }

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
            collectivePublicKey: collectivePublicKeyHex,
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

        //SECTION - Tính signature tập thể
        const partialSignatures = signatureResults.map((r) => hexToScalar(r.sI))
        const signature = aggregateSignatures(partialSignatures, ecParams)
        const signatureHex = scalarToHex(signature)

        await this.cacheManager.set(
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

        //SECTION - Kiểm tra election có đang active không để nhận vote
        await this.electionService.checkActiveElectionById({ id: dto.electionId })

        //SECTION - Pre-generate voteId để dùng làm key nhất quán trên cả chain và DB
        // voterId không dùng làm key on-chain để tránh link voter identity với vote record
        const voteId = new ObjectId().toHexString()

        //SECTION - Write-DB-First: ghi record trạng thái trung gian PENDING_CHAIN trước khi gọi chain.
        // Unique constraint @@unique([electionId, voterId]) chặn double-vote ngay tại đây (trước cả khi đụng chain).
        // Nếu DB fail ở bước này → chain chưa bị đụng → không lệch.
        try {
            await this.prisma.vote.create({
                data: {
                    id: voteId,
                    electionId: dto.electionId,
                    voterId: dto.voterId,
                    blindedCommitment: dto.blindedCommitment,
                    status: VoteStatus.PENDING_CHAIN
                    // blockchainRef để null cho tới khi chain confirm
                }
            })
        } catch (e) {
            handlePrismaError(e, [{ code: 'P2002', message: 'Voter already voted in this election' }])
        }

        //SECTION - Submit blinded commitment lên Fabric, rồi phân định kết quả để confirm/rollback DB
        let blockchainRef: string
        try {
            const fabricRes = await this.fabricClientService.submitVote(
                dto.electionId,
                voteId,
                dto.blindedCommitment.toLowerCase()
            )
            blockchainRef = fabricRes.result.transactionId
        } catch (chainErr) {
            //NOTE - Invoke ném lỗi không có nghĩa chắc chắn chain không ghi (có thể lỗi response/network sau khi commit).
            // Query GetVote để phân định: chain là nguồn sự thật.
            const chainVoteRes = await this.fabricClientService.getVote(dto.electionId, voteId)

            if (chainVoteRes.result) {
                //NOTE - Vote ĐÃ lên chain → coi như thành công, recover blockchainRef từ field txId của GetVote
                blockchainRef = JSON.parse(chainVoteRes.result).txId
            } else {
                //NOTE - Chain CHƯA có vote → rollback record PENDING (best-effort), trả lỗi để voter retry
                await this.prisma.vote.delete({ where: { id: voteId } }).catch((err) => {
                    this.logger.error(`Rollback pending vote ${voteId} failed: ${err?.message}`)
                })
                throw chainErr
            }
        }

        //SECTION - Confirm DB: chuyển PENDING_CHAIN → CONFIRMED và ghi blockchainRef để audit sau này
        const vote = await this.prisma.vote.update({
            where: { id: voteId },
            data: {
                status: VoteStatus.CONFIRMED,
                blockchainRef
            }
        })

        await this.cacheManager.set(
            `session:signed:${dto.voterId}`,
            {
                ...existSession,
                voted: true
            },
            CONFIGURATION.COORDINATOR_CONFIG.REDIS_SESSION_CACHE_TTL
        )

        //NOTE - Publish event realtime tới socket gateway qua Redis Pub/Sub (fire-and-forget, không await, lỗi broker không làm hỏng luồng vote và không tạo unhandled rejection)
        // Không gửi voterId để giữ tính ẩn danh trên socket mở
        this.eventBus
            .emit(SOCKET_EVENT_PATTERNS.VOTE_COMMITTED, {
                electionId: dto.electionId,
                blockchainRef: vote.blockchainRef,
                createdAt: vote.createdAt
            })
            .subscribe({
                error: (err) =>
                    this.logger.error(`Emit ${SOCKET_EVENT_PATTERNS.VOTE_COMMITTED} failed: ${err?.message}`)
            })

        return vote
    }

    async getCommitmentVotesByElectionId(dto: MongoIdDto) {
        //NOTE - Chỉ lấy vote đã CONFIRMED để build/verify Merkle tree khớp với những gì thực sự có trên chain.
        // Vote PENDING_CHAIN (chưa confirm) bị loại để Merkle root không lệch giữa DB và blockchain.
        return await this.prisma.vote.findMany({
            where: { electionId: dto.id, status: VoteStatus.CONFIRMED },
            orderBy: { createdAt: 'asc' },
            select: { blindedCommitment: true }
        })
    }

    async verifyVote(dto: VerifyVoteDto) {
        //SECTION - Bước 1: Check Election
        const existElection = await this.electionService.getElectionById({ id: dto.electionId })

        if (!existElection) {
            throw new NotFoundException('Election not found')
        }

        const normalizedBlindedCommitment = dto.blindedCommitment.toLowerCase()

        const result: {
            electionId: string
            voteId: string
            db: {
                exist: boolean
                voteIdMatch: boolean
                commitmentMatch: boolean
                blockchainRefMatch: boolean
                valid: boolean
            }
            chain: {
                exist: boolean
                txIdMatch: boolean
                commitmentMatch: boolean
                error: string | null
                valid: boolean
            }
            merkle: {
                applicable: boolean
                proof: string[] | null
                root: string | null
                rootMatchesChain: boolean
                rootMatchesDB: boolean
                proofValid: boolean
                chainProofValid: boolean
                getMerkleRootChainError: string | null
                verifyProofChainError: string | null
                valid: boolean
            }
            valid: boolean
        } = {
            electionId: dto.electionId,
            voteId: dto.id,
            db: { exist: false, voteIdMatch: false, commitmentMatch: false, blockchainRefMatch: false, valid: false },
            chain: { exist: false, txIdMatch: false, commitmentMatch: false, error: null, valid: false },
            merkle: {
                applicable: false,
                proof: null,
                root: null,
                rootMatchesChain: false,
                rootMatchesDB: false,
                proofValid: false,
                chainProofValid: false,
                getMerkleRootChainError: null,
                verifyProofChainError: null,
                valid: false
            },
            valid: false
        }

        //SECTION -  Bước 2: Verify Với MongoDB
        const dbExistVote = await this.prisma.vote.findUnique({
            where: {
                id: dto.id,
                electionId: dto.electionId
            },
            select: { id: true, blindedCommitment: true, blockchainRef: true }
        })

        if (dbExistVote) {
            result.db.exist = true
            result.db.voteIdMatch = String(dbExistVote.id) === String(dto.id)
            result.db.commitmentMatch = dbExistVote.blindedCommitment === normalizedBlindedCommitment
            result.db.blockchainRefMatch = dbExistVote.blockchainRef === dto.blockchainRef
        }

        //SECTION - Bước 3: Verify Với Fabric Vote Record (ngay khi vote xong)
        const chainVoteRes = await this.fabricClientService.getVote(dto.electionId, dto.id)
        const chainVote = chainVoteRes.result ? JSON.parse(chainVoteRes.result) : null

        if (chainVoteRes.result) {
            result.chain.exist = true
            result.chain.txIdMatch = chainVote.txId === dto.blockchainRef
            result.chain.commitmentMatch = chainVote.blindedCommitment === normalizedBlindedCommitment
        } else {
            result.chain.error = chainVoteRes.message
        }

        if (existElection.status === ElectionStatus.CLOSED || existElection.status === ElectionStatus.COMPLETED) {
            result.merkle.applicable = true

            //SECTION - Bước 4: Verify Merkle với db Sau Khi Election closed | completed
            const commitmentVotes = await this.getCommitmentVotesByElectionId({ id: dto.electionId })
            const leaves = commitmentVotes.map((cv) => cv.blindedCommitment)
            let proof = null

            try {
                proof = computeCommitmentProof(leaves, normalizedBlindedCommitment)

                result.merkle.root = proof.root
                result.merkle.proof = proof.proof
                result.merkle.rootMatchesDB = proof.root === existElection.merkleRoot
                //SECTION - Bước 5: Verify Proof Local, kiểm tra xem commitment có thuộc về election merkle root không
                result.merkle.proofValid = verifyCommitmentProof(normalizedBlindedCommitment, proof.proof, proof.root)
            } catch (e) {
                result.merkle.getMerkleRootChainError = (e as Error).message
            }

            //SECTION - Bước 6: So khớp root với merkle tree root trên blockchain
            const chainMerkleRes = await this.fabricClientService.getMerkleRoot(dto.electionId)
            const chainMerkleRoot = chainMerkleRes.result ? JSON.parse(chainMerkleRes.result).merkleRoot : null

            if (chainMerkleRes.result) {
                result.merkle.rootMatchesChain = chainMerkleRoot === result.merkle.root
            } else {
                result.merkle.getMerkleRootChainError = chainMerkleRes.message
            }

            //SECTION - Bước 7: Verify Proof với root trên blockchain
            if (proof) {
                const chainVerifyProofRes = await this.fabricClientService.verifyVoteReceipt(
                    dto.electionId,
                    normalizedBlindedCommitment,
                    proof.proof
                )

                const chainVerifyProof = chainVerifyProofRes.result ? JSON.parse(chainVerifyProofRes.result) : null

                if (chainVerifyProofRes.result) {
                    //NOTE -  blindedCommitment + proof tạo ra đúng Merkle root đã commit on-chain cho election đó.
                    result.merkle.chainProofValid = Boolean(chainVerifyProof.inElection)
                } else {
                    result.merkle.verifyProofChainError = chainVerifyProofRes.message
                }
            }
        }
        const dbOk =
            result.db.exist && result.db.voteIdMatch && result.db.commitmentMatch && result.db.blockchainRefMatch
        const chainOk = result.chain.exist && result.chain.txIdMatch && result.chain.commitmentMatch
        const merkleOk =
            result.merkle.applicable &&
            result.merkle.proofValid &&
            result.merkle.rootMatchesDB &&
            result.merkle.rootMatchesChain &&
            result.merkle.chainProofValid

        result.db.valid = dbOk
        result.chain.valid = chainOk
        result.merkle.valid = merkleOk
        result.valid = dbOk && chainOk && merkleOk
        return result
    }
}
