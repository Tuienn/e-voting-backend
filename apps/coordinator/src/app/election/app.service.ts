import { computeCollectivePublicKey, getParams, hexToPoint, isValidPointHex, pointToHex } from '@libs/ec-schnorr'
import { removeUndefinedObj } from '@libs/utils/object.util'
import { PaginationMeta } from '@libs/types/common.type'
import { handlePrismaError } from '@libs/utils/handle-prisma-error.util'
import { MongoIdDto } from '@libs/types/common.dto'
import {
    CandidateIdsDto,
    CreateElectionDto,
    FilterElectionsDto,
    GetElectionsByUserIdDto,
    GetMyElectionAllInfoDto,
    GetVoterInElectionDto,
    VoterIdsDto
} from '@libs/types/coordinator/election.dto'
import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    forwardRef,
    Inject,
    Injectable,
    NotFoundException,
    UnprocessableEntityException
} from '@nestjs/common'
import { PrismaService } from '../../infrastructure/prisma/prisma.service'
import { Election, ElectionStatus, VoteStatus } from '../../../generated/prisma/client'
import { CONFIGURATION } from '../../configuration'
import { ClientProxy } from '@nestjs/microservices'
import { lastValueFrom } from 'rxjs'
import { IDENTITY_MESSAGE_PATTERNS, SIGNING_NODE_MESSAGE_PATTERNS } from '@libs/constants/message-patterns.constant'
import { ModuleRef } from '@nestjs/core'
import { Cache, CACHE_MANAGER } from '@nestjs/cache-manager'
import { FabricClientService } from '@libs/fabric'
import { AppService as VoteService } from '../vote/app.service'
import { buildCommitmentMerkleTree } from '@libs/fabric'

@Injectable()
export class AppService {
    private readonly signingNodeClients: ClientProxy[]

    constructor(
        private readonly moduleRef: ModuleRef,
        @Inject(`TCP_${CONFIGURATION.COORDINATOR_CONFIG.IDENTITY_TCP_NAME}`)
        private readonly identityClient: ClientProxy,
        private readonly prisma: PrismaService,
        @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
        private readonly fabricClient: FabricClientService,
        @Inject(forwardRef(() => VoteService)) private readonly voteService: VoteService
    ) {
        this.signingNodeClients = CONFIGURATION.COORDINATOR_CONFIG.SIGNING_NODES_TCP_NAME.map((serviceName) =>
            this.moduleRef.get<ClientProxy>(`TCP_${serviceName}`, { strict: false })
        )
    }

    private async checkCandidatesExistAndActive(candidateIds: string[]) {
        const candidates = await lastValueFrom(
            this.identityClient.send(IDENTITY_MESSAGE_PATTERNS.GET_USERS_BY_IDS, {
                ids: candidateIds,
                role: 'CANDIDATE'
            })
        )

        const requestedUnique = [...new Set(candidateIds)]
        const foundIds = new Set(candidates.map((c: any) => c.id))
        const missingIds = requestedUnique.filter((id) => !foundIds.has(id))

        if (missingIds.length > 0) {
            throw new BadRequestException(
                `Candidate IDs do not exist or are not users with role CANDIDATE: ${missingIds.join(', ')}`
            )
        }

        const inactiveIds = candidates.filter((c: any) => !c.isActive).map((c: any) => c.id)
        if (inactiveIds.length > 0) {
            throw new BadRequestException(`Some candidates are inactive: ${inactiveIds.join(', ')}`)
        }
    }

    async generateCollectivePublicKey(electionId: string): Promise<string> {
        const ecParams = getParams()

        //SECTION - Nếu chưa có thì gọi các signing node để generate public key và tính toán collective public key
        const results = await Promise.all(
            this.signingNodeClients.map((client) =>
                lastValueFrom(client.send(SIGNING_NODE_MESSAGE_PATTERNS.GENERATE_KEY_PAIR, { electionId }))
            )
        )

        const publicKeys = results.map((result) => {
            if (!isValidPointHex(result.publicKey, ecParams.Point)) {
                throw new BadRequestException('Invalid public key from signing node')
            }
            return hexToPoint(result.publicKey, ecParams)
        })

        const collectivePublicKey = computeCollectivePublicKey(publicKeys, ecParams)
        const collectivePublicKeyHex = pointToHex(collectivePublicKey)

        return collectivePublicKeyHex
    }

    async filterElections(dto: FilterElectionsDto): Promise<
        {
            data: Election[]
        } & PaginationMeta
    > {
        const { name, status, startDate, endDate, page = 0, pageSize = 10 } = dto ?? {}

        const [data, total] = await this.prisma.$transaction([
            this.prisma.election.findMany({
                where: removeUndefinedObj({
                    name: name ? { contains: name, mode: 'insensitive' } : undefined,
                    status: status ? { equals: status as ElectionStatus } : undefined,
                    startDate: startDate ? { gte: new Date(startDate) } : undefined,
                    endDate: endDate ? { lte: new Date(endDate) } : undefined
                }),
                orderBy: { createdAt: 'desc' },
                skip: page * pageSize,
                take: pageSize
            }),
            this.prisma.election.count({
                where: removeUndefinedObj({
                    name: name ? { contains: name, mode: 'insensitive' } : undefined,
                    status: status ? { equals: status as ElectionStatus } : undefined,
                    startDate: startDate ? { gte: new Date(startDate) } : undefined,
                    endDate: endDate ? { lte: new Date(endDate) } : undefined
                })
            })
        ])

        return {
            data,
            totalPages: Math.ceil(total / pageSize),
            currentPage: page,
            pageSize: pageSize,
            total
        }
    }

    async createElection(dto: CreateElectionDto) {
        //SECTION - Kiểm tra candidateIds có tồn tại và active không
        await this.checkCandidatesExistAndActive(dto.candidateIds)

        //SECTION - maxSelectableCandidates: default 1, phải nằm trong [1, số ứng viên]
        const maxSelectableCandidates = dto.maxSelectableCandidates ?? 1
        if (maxSelectableCandidates > dto.candidateIds.length - 1) {
            throw new BadRequestException('maxSelectableCandidates cannot exceed the number of candidates')
        }

        try {
            return await this.prisma.election.create({
                data: {
                    name: dto.name,
                    candidateIds: dto.candidateIds,
                    maxSelectableCandidates
                },
                omit: {
                    collectivePublicKey: true,
                    blockchainRef: true,
                    merkleRoot: true
                }
            })
        } catch (e) {
            handlePrismaError(e)
        }
    }

    async addCandidatesToElection(dto: MongoIdDto & CandidateIdsDto) {
        try {
            //SECTION - Kiểm tra election có tồn tại không
            const election = await this.prisma.election.findUniqueOrThrow({
                where: { id: dto.id },
                select: { status: true }
            })

            if (election.status !== ElectionStatus.PENDING) {
                throw new ConflictException('Only PENDING election can be added candidates')
            }

            //SECTION - Kiểm tra candidateIds có tồn tại và active không
            await this.checkCandidatesExistAndActive(dto.candidateIds)

            return await this.prisma.$transaction(async (tx) => {
                const current = await tx.election.findUniqueOrThrow({
                    where: { id: dto.id },
                    select: { status: true, candidateIds: true }
                })

                if (current.status !== ElectionStatus.PENDING) {
                    throw new ConflictException('Only PENDING election can be added candidates')
                }

                const mergeCandidateIds = Array.from(new Set([...(current.candidateIds ?? []), ...dto.candidateIds]))

                //SECTION - Thêm candidates vào election
                return await tx.election.update({
                    where: {
                        id: dto.id
                    },
                    data: {
                        candidateIds: mergeCandidateIds
                    },
                    omit: {
                        collectivePublicKey: true,
                        blockchainRef: true,
                        merkleRoot: true
                    }
                })
            })
        } catch (e) {
            handlePrismaError(e)
        }
    }

    async deleteCandidatesFromElection(dto: MongoIdDto & CandidateIdsDto) {
        try {
            const election = await this.prisma.election.findUniqueOrThrow({
                where: {
                    id: dto.id
                },
                select: { status: true, candidateIds: true }
            })

            if (election.status !== ElectionStatus.PENDING) {
                throw new ConflictException('Only PENDING election can be removed candidates')
            }

            return await this.prisma.election.update({
                where: {
                    id: dto.id
                },
                data: {
                    candidateIds: election.candidateIds.filter((id) => !dto.candidateIds.includes(id))
                }
            })
        } catch (e) {
            handlePrismaError(e)
        }
    }

    async addVotersToElection(dto: MongoIdDto & VoterIdsDto) {
        //NOTE - dentity service chậm hoặc timeout → transaction của MongoDB bị giữ mở → timeout.
        // Ngoài ra, validation voter xảy ra bên trong transaction tăng dead lock
        try {
            const election = await this.prisma.election.findUniqueOrThrow({
                where: {
                    id: dto.id
                },
                select: { status: true }
            })

            if (election.status !== ElectionStatus.PENDING) {
                throw new ConflictException('Only PENDING election can be added voters')
            }

            //SECTION - Kiểm tra voterIds có tồn tại và active không
            const voters = await lastValueFrom(
                this.identityClient.send(IDENTITY_MESSAGE_PATTERNS.GET_USERS_BY_IDS, {
                    ids: dto.voterIds,
                    role: 'VOTER'
                })
            )

            const requestedUnique = [...new Set(dto.voterIds)]
            const foundIds = new Set(voters.map((v: any) => v.id))
            const missingIds = requestedUnique.filter((id) => !foundIds.has(id))

            if (missingIds.length > 0) {
                throw new BadRequestException(
                    `Voter IDs do not exist or are not users with role VOTER: ${missingIds.join(', ')}`
                )
            }

            const inactiveIds = voters.filter((v: any) => !v.isActive).map((v: any) => v.id)
            if (inactiveIds.length > 0) {
                throw new BadRequestException(`Some voters are inactive: ${inactiveIds.join(', ')}`)
            }

            return await this.prisma.$transaction(async (tx) => {
                const current = await tx.election.findUniqueOrThrow({ where: { id: dto.id }, select: { status: true } })
                if (current.status !== ElectionStatus.PENDING) {
                    throw new ConflictException('Only PENDING election can be added voters')
                }

                //SECTION - Thêm voters vào election
                return await tx.election.update({
                    where: {
                        id: dto.id
                    },
                    data: {
                        electionVoters: {
                            createMany: {
                                data: dto.voterIds.map((voterId) => ({
                                    voterId
                                }))
                            }
                        }
                    },
                    include: {
                        electionVoters: true
                    },
                    omit: {
                        collectivePublicKey: true,
                        blockchainRef: true,
                        merkleRoot: true
                    }
                })
            })
        } catch (e) {
            handlePrismaError(e, [{ code: 'P2002', message: 'Some voters are already added to election' }])
        }
    }

    async deleteVotersFromElection(dto: MongoIdDto & VoterIdsDto) {
        try {
            const election = await this.prisma.election.findUniqueOrThrow({
                where: { id: dto.id },
                select: { status: true }
            })

            if (election.status !== ElectionStatus.PENDING) {
                throw new ConflictException('Only PENDING election can be removed voters')
            }

            return await this.prisma.$transaction(async (tx) => {
                const current = await tx.election.findUniqueOrThrow({ where: { id: dto.id }, select: { status: true } })
                if (current.status !== ElectionStatus.PENDING) {
                    throw new ConflictException('Only PENDING election can be removed voters')
                }

                //SECTION - Xóa voters khỏi election
                return await tx.election.update({
                    where: {
                        id: dto.id
                    },
                    data: {
                        electionVoters: {
                            deleteMany: {
                                voterId: { in: dto.voterIds }
                            }
                        }
                    },
                    include: {
                        electionVoters: true
                    },
                    omit: {
                        collectivePublicKey: true,
                        blockchainRef: true,
                        merkleRoot: true
                    }
                })
            })
        } catch (e) {
            handlePrismaError(e)
        }
    }

    async startElection(dto: MongoIdDto) {
        //SECTION - Pre-validate — không cần transaction
        const election = await this.prisma.election.findUniqueOrThrow({
            where: { id: dto.id },
            select: {
                status: true,
                candidateIds: true,
                electionVoters: { select: { id: true } }
            }
        })

        if (election.status !== ElectionStatus.PENDING) {
            throw new ConflictException('Only PENDING election can be started')
        }
        if (election.candidateIds.length < 2) {
            throw new UnprocessableEntityException('At least 2 candidates are required')
        }
        if (!election.electionVoters || election.electionVoters.length < 3) {
            throw new UnprocessableEntityException('At least 3 voters are required')
        }

        //SECTION - Generate keys — ngoài transaction, tránh bị lock transaction
        const collectivePublicKeyHex = await this.generateCollectivePublicKey(dto.id)

        //SECTION - Commit — transaction ngắn, chỉ write
        try {
            return await this.prisma.$transaction(async (tx) => {
                // Re-validate chống race condition (ai đó startElection đồng thời)
                const current = await tx.election.findUniqueOrThrow({ where: { id: dto.id }, select: { status: true } })
                if (current.status !== ElectionStatus.PENDING) {
                    throw new ConflictException('Only PENDING election can be started')
                }

                return await tx.election.update({
                    where: { id: dto.id },
                    data: {
                        status: ElectionStatus.ACTIVE,
                        startDate: new Date(),
                        collectivePublicKey: collectivePublicKeyHex
                    },
                    omit: { blockchainRef: true, merkleRoot: true }
                })
            })
        } catch (e) {
            handlePrismaError(e)
        }
    }

    async closeElection(dto: MongoIdDto) {
        try {
            //SECTION - Pre-validate — không cần transaction
            const election = await this.prisma.election.findUniqueOrThrow({
                where: { id: dto.id },
                select: { startDate: true, endDate: true, status: true }
            })

            if (!election.startDate) {
                throw new ConflictException('Election not started')
            }
            if (election.endDate) {
                throw new ConflictException('Election already closed')
            }
            if (election.status !== ElectionStatus.ACTIVE) {
                throw new ConflictException('Only ACTIVE election can be closed')
            }

            //SECTION - Build merkle tree — ngoài transaction, tránh giữ lock
            const commitmentVotes = await this.voteService.getCommitmentVotesByElectionId({ id: dto.id })

            if (commitmentVotes.length === 0) {
                throw new ConflictException('No votes submitted for this election')
            }

            const leaves = commitmentVotes.map((cv) => cv.blindedCommitment)
            const { root } = buildCommitmentMerkleTree(leaves)

            //SECTION - Write-DB-First Step A: ACTIVE → CLOSING (trạng thái trung gian, ghi sẵn merkleRoot).
            // CLOSING vừa là điểm phục hồi cho reconciler, vừa đóng vai trò "lock" chống closeElection đồng thời
            // (call thứ hai sẽ thấy status ≠ ACTIVE và bị từ chối).
            await this.prisma.$transaction(async (tx) => {
                const current = await tx.election.findUniqueOrThrow({ where: { id: dto.id }, select: { status: true } })
                if (current.status !== ElectionStatus.ACTIVE) {
                    throw new ConflictException('Only ACTIVE election can be closed')
                }

                await tx.election.update({
                    where: { id: dto.id },
                    data: { status: ElectionStatus.CLOSING, merkleRoot: root }
                })
            })

            //SECTION - Step B: Commit merkle lên blockchain (~2s), rồi phân định confirm/rollback
            //NOTE - Trade-off cần lưu ý: Nếu có concurrent call closeElection trong window 2s đó, cả hai đều gọi fabric ->check trong chaincode->reject
            let blockchainRef: string
            let confirmedRoot = root
            try {
                const fabricRes = await this.fabricClient.commitMerkleRoot(dto.id, root, leaves.length)
                blockchainRef = fabricRes.result.transactionId
            } catch (chainErr) {
                //NOTE - Invoke ném lỗi không chắc chain chưa commit (có thể lỗi response/network sau commit).
                // Query GetMerkleRoot để phân định — chain là nguồn sự thật.
                const chainMerkleRes = await this.fabricClient.getMerkleRoot(dto.id)

                if (chainMerkleRes.result) {
                    //NOTE - Root ĐÃ committed trên chain → recover txId + merkleRoot từ chain (GetMerkleRoot trả field txId)
                    const chainMerkle = JSON.parse(chainMerkleRes.result)
                    blockchainRef = chainMerkle.txId
                    confirmedRoot = chainMerkle.merkleRoot ?? root
                } else {
                    //NOTE - Chain CHƯA commit → rollback CLOSING → ACTIVE (best-effort) để admin retry, rồi ném lỗi
                    await this.prisma.election
                        .update({ where: { id: dto.id }, data: { status: ElectionStatus.ACTIVE, merkleRoot: null } })
                        .catch(() => undefined)
                    throw chainErr
                }
            }

            //SECTION - Step C: Confirm CLOSING → CLOSED + ghi blockchainRef
            const updatedElection = await this.prisma.election.update({
                where: { id: dto.id },
                data: {
                    status: ElectionStatus.CLOSED,
                    merkleRoot: confirmedRoot,
                    blockchainRef
                }
            })

            //NOTE - vote.count sau transaction — an toàn vì election đã CLOSED, không nhận vote mới
            // submitBlindedCommitment gọi checkActiveElectionById trước khi insert vote — một vote mới không thể lọt vào election đã CLOSED
            const voteCount = await this.voteService.getVoteCount({ id: dto.id })

            await this.cacheManager.set(
                `election:vote:count:${dto.id}`,
                voteCount,
                CONFIGURATION.COORDINATOR_CONFIG.REDIS_VOTE_COUNT_CACHE_TTL
            )

            return updatedElection
        } catch (e) {
            handlePrismaError(e)
        }
    }

    async completeElection(dto: MongoIdDto) {
        try {
            const election = await this.prisma.$transaction(async (tx) => {
                const election = await tx.election.findUniqueOrThrow({
                    where: { id: dto.id },
                    select: { status: true }
                })

                if (election.status === ElectionStatus.COMPLETED) {
                    throw new ConflictException('Election already completed')
                }

                if (election.status !== ElectionStatus.CLOSED) {
                    throw new ConflictException('Only CLOSED election can be completed')
                }

                return await tx.election.update({
                    where: {
                        id: dto.id
                    },
                    data: {
                        status: ElectionStatus.COMPLETED,
                        endDate: new Date()
                    }
                })
            })

            //NOTE - Gửi message để xóa key pair và signed voter ở signing node
            this.signingNodeClients.forEach((client) =>
                client.emit(SIGNING_NODE_MESSAGE_PATTERNS.CLEANUP_ELECTION, { electionId: dto.id }).subscribe()
            )
            //NOTE - Xóa cache vote count
            await this.cacheManager.del(`election:vote:count:${dto.id}`)

            return election
        } catch (e) {
            handlePrismaError(e)
        }
    }

    async getElectionById(dto: MongoIdDto) {
        try {
            return await this.prisma.election.findUnique({
                where: {
                    id: dto.id
                }
            })
        } catch (e) {
            handlePrismaError(e)
        }
    }

    async getElectionAllInfo(dto: MongoIdDto) {
        const election = await this.getElectionById(dto)
        if (!election) {
            throw new NotFoundException('Election not found')
        }

        const [candidates, electionVoters] = await Promise.all([
            election.candidateIds.length > 0
                ? lastValueFrom(
                      this.identityClient.send(IDENTITY_MESSAGE_PATTERNS.GET_USERS_BY_IDS, {
                          ids: election.candidateIds,
                          role: 'CANDIDATE'
                      })
                  )
                : Promise.resolve([]),
            this.prisma.electionVoter.findMany({
                where: { electionId: dto.id },
                select: { voterId: true }
            })
        ])

        const voterIds = electionVoters.map((ev) => ev.voterId)
        const voters =
            voterIds.length > 0
                ? await lastValueFrom(
                      this.identityClient.send(IDENTITY_MESSAGE_PATTERNS.GET_USERS_BY_IDS, {
                          ids: voterIds,
                          role: 'VOTER'
                      })
                  )
                : []

        return { ...election, candidates: candidates ?? [], voters: voters ?? [] }
    }

    async getMyElectionAllInfo(dto: GetMyElectionAllInfoDto) {
        const [election, myVote] = await Promise.all([
            this.getElectionAllInfo({ id: dto.electionId }),
            // Mặc định chỉ trả vote đã CONFIRMED (đã có trên blockchain); findFirst để lọc thêm theo status
            this.prisma.vote.findFirst({
                where: {
                    electionId: dto.electionId,
                    voterId: dto.voterId,
                    status: VoteStatus.CONFIRMED
                }
            })
        ])

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { voters: _voters, ...voterSafeElection } = election ?? {}
        return { ...voterSafeElection, vote: myVote ?? null }
    }

    async getVoterInElection(dto: GetVoterInElectionDto) {
        //SECTION - Kiểm tra election có tồn tại không
        const election = await this.getElectionById({ id: dto.electionId })
        if (!election) {
            throw new NotFoundException('Election not found')
        }

        //SECTION - Kiểm tra election voter có tồn tại không
        const electionVoter = await this.prisma.electionVoter.findUnique({
            where: {
                electionId_voterId: {
                    electionId: dto.electionId,
                    voterId: dto.voterId
                }
            }
        })

        if (!electionVoter) {
            throw new ForbiddenException(
                `Voter with ID ${dto.voterId} is not allowed to vote in election ${dto.electionId}`
            )
        }

        //SECTION - Kiểm tra voter có tồn tại không
        const voter = await lastValueFrom(
            this.identityClient.send(IDENTITY_MESSAGE_PATTERNS.GET_USER_BY_ID, {
                id: electionVoter.voterId
            })
        )

        if (!voter) {
            throw new NotFoundException(`Voter with id ${dto.voterId} not found`)
        }

        return {
            electionVoter,
            voter
        }
    }

    async getElectionsByVoterId(dto: GetElectionsByUserIdDto) {
        try {
            const electionVoters = await this.prisma.electionVoter.findMany({
                where: removeUndefinedObj({ voterId: dto.userId, election: { status: dto.status } }),
                // Mặc định chỉ trả vote đã CONFIRMED (đã có trên blockchain)
                select: { election: true, votes: { where: { status: VoteStatus.CONFIRMED } } },
                orderBy: { election: { updatedAt: 'desc' } }
            })

            return electionVoters.map((ev) => ({ ...ev.election, vote: ev.votes[0] ?? null }))
        } catch (e) {
            handlePrismaError(e)
        }
    }

    async getElectionsByCandidateId(dto: GetElectionsByUserIdDto) {
        try {
            const elections = await this.prisma.election.findMany({
                where: removeUndefinedObj({
                    candidateIds: {
                        has: dto.userId
                    },
                    status: dto.status
                }),
                orderBy: { updatedAt: 'desc' }
            })

            return elections
        } catch (e) {
            handlePrismaError(e)
        }
    }

    async getElectionCountByVoterId(dto: MongoIdDto) {
        const statuses = [
            ElectionStatus.PENDING,
            ElectionStatus.ACTIVE,
            ElectionStatus.CLOSED,
            ElectionStatus.COMPLETED
        ]

        const counts = await Promise.all(
            statuses.map((status) =>
                this.prisma.electionVoter.count({
                    where: { voterId: dto.id, election: { status } }
                })
            )
        )

        return {
            pending: counts[0],
            active: counts[1],
            closed: counts[2],
            completed: counts[3]
        }
    }

    async checkActiveElectionById(dto: MongoIdDto) {
        const election = await this.getElectionById(dto)

        if (!election) {
            throw new NotFoundException('Election not found')
        }

        if (election.status !== ElectionStatus.ACTIVE) {
            throw new ConflictException('Election is not active')
        }
    }
}
