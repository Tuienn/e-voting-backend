import { removeUndefinedObj } from '@libs/utils/object.util'
import {
    CandidateIdsDto,
    CreateElectionDto,
    FilterElectionsDto,
    VoterIdsDto
} from '@libs/types/coordinator/election.dto'
import { Inject, Injectable, NotFoundException } from '@nestjs/common'
import { CONFIGURATION } from '../../configuration'
import { ClientProxy } from '@nestjs/microservices'
import { COORDINATOR_MESSAGE_PATTERNS, IDENTITY_MESSAGE_PATTERNS } from '@libs/constants/message-patterns.constant'
import { lastValueFrom } from 'rxjs'
import { MongoIdDto } from '@libs/types/common.dto'
import {
    BffFilterVotesDto,
    SignBlindedVoteDto,
    StartSessionDto,
    SubmitBlindedCommitmentDto,
    VerifyVoteDto
} from '@libs/types/coordinator/vote.dto'

@Injectable()
export class AppService {
    constructor(
        @Inject(`TCP_${CONFIGURATION.BFF_CONFIG.COORDINATOR_TCP_NAME}`) private readonly coordinatorClient: ClientProxy,

        @Inject(`TCP_${CONFIGURATION.BFF_CONFIG.IDENTITY_TCP_NAME}`) private readonly identityClient: ClientProxy
    ) {}

    //SECTION - Coordinator - Election
    async filterElections(dto: FilterElectionsDto) {
        return lastValueFrom(this.coordinatorClient.send(COORDINATOR_MESSAGE_PATTERNS.FILTER_ELECTIONS, dto))
    }

    async createElection(dto: CreateElectionDto) {
        return lastValueFrom(this.coordinatorClient.send(COORDINATOR_MESSAGE_PATTERNS.CREATE_ELECTION, dto))
    }

    async addCandidatesToElection(dto: MongoIdDto & CandidateIdsDto) {
        return lastValueFrom(this.coordinatorClient.send(COORDINATOR_MESSAGE_PATTERNS.ADD_CANDIDATES_TO_ELECTION, dto))
    }

    async deleteCandidatesFromElection(dto: MongoIdDto & CandidateIdsDto) {
        return lastValueFrom(
            this.coordinatorClient.send(COORDINATOR_MESSAGE_PATTERNS.DELETE_CANDIDATES_FROM_ELECTION, dto)
        )
    }

    async addVotersToElection(dto: MongoIdDto & VoterIdsDto) {
        return lastValueFrom(this.coordinatorClient.send(COORDINATOR_MESSAGE_PATTERNS.ADD_VOTERS_TO_ELECTION, dto))
    }

    async deleteVotersFromElection(dto: MongoIdDto & VoterIdsDto) {
        return lastValueFrom(this.coordinatorClient.send(COORDINATOR_MESSAGE_PATTERNS.DELETE_VOTERS_FROM_ELECTION, dto))
    }

    async getElectionsByVoterId(dto: MongoIdDto) {
        return lastValueFrom(this.coordinatorClient.send(COORDINATOR_MESSAGE_PATTERNS.GET_ELECTIONS_BY_VOTER_ID, dto))
    }

    async startElection(dto: MongoIdDto) {
        return lastValueFrom(this.coordinatorClient.send(COORDINATOR_MESSAGE_PATTERNS.START_ELECTION, dto))
    }

    async closeElection(dto: MongoIdDto) {
        return lastValueFrom(this.coordinatorClient.send(COORDINATOR_MESSAGE_PATTERNS.END_ELECTION, dto))
    }

    async getElectionById(dto: MongoIdDto) {
        const election = await lastValueFrom(
            this.coordinatorClient.send(COORDINATOR_MESSAGE_PATTERNS.GET_ELECTION_BY_ID, dto)
        )

        if (!election) {
            throw new NotFoundException('Election not found')
        }

        return election
    }

    async getElectionAllInfo(dto: MongoIdDto) {
        return lastValueFrom(this.coordinatorClient.send(COORDINATOR_MESSAGE_PATTERNS.GET_ELECTION_ALL_INFO, dto))
    }

    async getElectionsByCandidateId(dto: MongoIdDto) {
        return lastValueFrom(
            this.coordinatorClient.send(COORDINATOR_MESSAGE_PATTERNS.GET_ELECTIONS_BY_CANDIDATE_ID, dto)
        )
    }

    //SECTION - Coordinator - Vote
    async startVoteSession(dto: StartSessionDto) {
        return lastValueFrom(this.coordinatorClient.send(COORDINATOR_MESSAGE_PATTERNS.START_SESSION, dto))
    }

    async signBlindedVote(dto: SignBlindedVoteDto) {
        return lastValueFrom(this.coordinatorClient.send(COORDINATOR_MESSAGE_PATTERNS.SIGN_BLINDED_VOTE, dto))
    }

    async submitBlindedCommitment(dto: SubmitBlindedCommitmentDto) {
        return lastValueFrom(this.coordinatorClient.send(COORDINATOR_MESSAGE_PATTERNS.SUBMIT_BLINDED_COMMITMENT, dto))
    }

    async verifyVote(dto: VerifyVoteDto) {
        return lastValueFrom(this.coordinatorClient.send(COORDINATOR_MESSAGE_PATTERNS.VERIFY_VOTE, dto))
    }

    async filterVotes(dto: BffFilterVotesDto) {
        let voterId = undefined
        if (dto.voterEmail) {
            const voter = await lastValueFrom(
                this.identityClient.send(IDENTITY_MESSAGE_PATTERNS.GET_USER_BY_EMAIL, { email: dto.voterEmail })
            )

            voterId = voter?.id
        }

        return lastValueFrom(
            this.coordinatorClient.send(
                COORDINATOR_MESSAGE_PATTERNS.FILTER_VOTES,
                removeUndefinedObj({
                    voterId,
                    startDate: dto.startDate,
                    endDate: dto.endDate,
                    page: dto.page,
                    pageSize: dto.pageSize,
                    electionId: dto.electionId
                })
            )
        )
    }
}
