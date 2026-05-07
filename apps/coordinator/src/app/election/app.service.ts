import { removeUndefinedObj } from '@libs/utils/object.util'
import { PaginationMeta } from '@libs/types/common.type'
import { handlePrismaError } from '@libs/utils/handle-prisma-error.util'
import { MongoIdDto } from '@libs/types/common.dto'
import {
    CreateElectionDto,
    FilterElectionsDto,
    GetVoterInElectionDto,
    VoterIdsDto
} from '@libs/types/coordinator/election.dto'
import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Inject,
    Injectable,
    NotFoundException,
    UnprocessableEntityException
} from '@nestjs/common'
import { PrismaService } from '../../infrastructure/prisma/prisma.service'
import { Election, ElectionStatus } from '../../../generated/prisma/client'
import { CONFIGURATION } from '../../configuration'
import { ClientProxy } from '@nestjs/microservices'
import { lastValueFrom } from 'rxjs'
import { IDENTITY_MESSAGE_PATTERNS, SIGNING_NODE_MESSAGE_PATTERNS } from '@libs/constants/message-patterns.constant'
import { ModuleRef } from '@nestjs/core'
import { computeCollectivePublicKey, isValidHex, BN } from '@libs/schnorr-blind'

@Injectable()
export class AppService {
    private readonly signingNodeClients: ClientProxy[]

    constructor(
        private readonly moduleRef: ModuleRef,
        @Inject(`TCP_${CONFIGURATION.COORDINATOR_CONFIG.IDENTITY_TCP_NAME}`)
        private readonly identityClient: ClientProxy,
        private readonly prisma: PrismaService
    ) {
        this.signingNodeClients = CONFIGURATION.COORDINATOR_CONFIG.SIGNING_NODES_TCP_NAME.map((serviceName) =>
            this.moduleRef.get<ClientProxy>(`TCP_${serviceName}`, { strict: false })
        )
    }

    private async collectivePublicKey() {
        const results = await Promise.all(
            this.signingNodeClients.map((client) =>
                lastValueFrom(client.send(SIGNING_NODE_MESSAGE_PATTERNS.GET_NODE_INFO, {}))
            )
        )

        const [first, ...rest] = results
        const p = new BN(first.params.p, 16)

        const isMismatch = rest.some(
            (item) =>
                item.params.p !== first.params.p || item.params.q !== first.params.q || item.params.g !== first.params.g
        )

        if (isMismatch) {
            throw new BadRequestException('Inconsistent cryptographic parameters (p, q, g) across signing nodes')
        }

        const publicKeys = results.map((result) => {
            if (!isValidHex(result.publicKey)) {
                throw new BadRequestException('Invalid public key from signing node')
            }
            return new BN(result.publicKey, 16)
        })

        return computeCollectivePublicKey(publicKeys, p)
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
            this.prisma.election.count()
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
        //SECTION- Kiểm tra candidateIds có tồn tại và active không
        const candidates = await lastValueFrom(
            this.identityClient.send(IDENTITY_MESSAGE_PATTERNS.GET_USERS_BY_IDS, {
                ids: dto.candidateIds,
                role: 'CANDIDATE'
            })
        )

        const requestedUnique = [...new Set(dto.candidateIds)]
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

        try {
            return await this.prisma.election.create({
                data: {
                    name: dto.name,
                    candidateIds: dto.candidateIds
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

    async addVotersToElection(dto: MongoIdDto & VoterIdsDto) {
        try {
            return await this.prisma.$transaction(async (tx) => {
                const election = await tx.election.findUniqueOrThrow({
                    where: {
                        id: dto.id
                    }
                })

                if (election.status !== ElectionStatus.PENDING) {
                    throw new ConflictException('Only PENDING election can be added voters')
                }

                //SECTION- Kiểm tra voterIds có tồn tại và active không
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

                //SECTION- Thêm voters vào election
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
            handlePrismaError(e)
        }
    }

    async startElection(dto: MongoIdDto) {
        const collectivePublicKey = await this.collectivePublicKey()

        try {
            return await this.prisma.$transaction(async (tx) => {
                const election = await tx.election.findUniqueOrThrow({
                    where: {
                        id: dto.id
                    },
                    include: {
                        electionVoters: true
                    }
                })

                if (election.startDate) {
                    throw new ConflictException('Election already started')
                }

                if (election.status !== ElectionStatus.PENDING) {
                    throw new ConflictException('Only PENDING election can be started')
                }

                if (election.candidateIds.length < 2) {
                    throw new UnprocessableEntityException('At least 2 candidates are required')
                }

                if (!election.electionVoters || election.electionVoters.length < 2) {
                    throw new UnprocessableEntityException('At least 2 voters are required to start the election')
                }

                return await tx.election.update({
                    where: {
                        id: dto.id
                    },
                    data: {
                        status: ElectionStatus.ACTIVE,
                        startDate: new Date(),
                        collectivePublicKey: collectivePublicKey.toString(16)
                    },
                    omit: {
                        blockchainRef: true,
                        merkleRoot: true
                    }
                })
            })
        } catch (e) {
            handlePrismaError(e)
        }
    }

    async endElection(dto: MongoIdDto) {
        try {
            return await this.prisma.$transaction(async (tx) => {
                const election = await tx.election.findUniqueOrThrow({
                    where: {
                        id: dto.id
                    }
                })

                if (!election.startDate) {
                    throw new ConflictException('Election not started')
                }

                if (election.endDate) {
                    throw new ConflictException('Election already ended')
                }
                if (election.status !== ElectionStatus.ACTIVE) {
                    throw new ConflictException('Only ACTIVE election can be ended')
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
        } catch (e) {
            handlePrismaError(e)
        }
    }

    async getElectionById(dto: MongoIdDto) {
        try {
            return await this.prisma.election.findUniqueOrThrow({
                where: {
                    id: dto.id
                }
            })
        } catch (e) {
            handlePrismaError(e)
        }
    }

    async getVoterInElection(dto: GetVoterInElectionDto) {
        //SECTION- Kiểm tra election có tồn tại không
        await this.getElectionById({ id: dto.electionId })

        //SECTION- Kiểm tra election voter có tồn tại không
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

        //SECTION- Kiểm tra voter có tồn tại không
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
}
