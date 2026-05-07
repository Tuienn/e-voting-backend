import { CreateElectionDto, FilterElectionsDto, VoterIdsDto } from '@libs/types/coordinator/election.dto'
import { Inject, Injectable } from '@nestjs/common'
import { CONFIGURATION } from '../../configuration'
import { ClientProxy } from '@nestjs/microservices'
import { COORDINATOR_MESSAGE_PATTERNS } from '@libs/constants/message-patterns.constant'
import { lastValueFrom } from 'rxjs'
import { MongoIdDto } from '@libs/types/common.dto'
import { SignBlindedVoteDto, StartSessionDto, SubmitUnblindedVoteDto } from '@libs/types/coordinator/vote.dto'

@Injectable()
export class AppService {
    constructor(
        @Inject(`TCP_${CONFIGURATION.BFF_CONFIG.COORDINATOR_TCP_NAME}`) private readonly coordinatorClient: ClientProxy
    ) {}

    //SECTION - Coordinator - Election
    async filterElections(dto: FilterElectionsDto) {
        return lastValueFrom(this.coordinatorClient.send(COORDINATOR_MESSAGE_PATTERNS.FILTER_ELECTIONS, dto))
    }

    async createElection(dto: CreateElectionDto) {
        return lastValueFrom(this.coordinatorClient.send(COORDINATOR_MESSAGE_PATTERNS.CREATE_ELECTION, dto))
    }

    async addVotersToElection(dto: MongoIdDto & VoterIdsDto) {
        return lastValueFrom(this.coordinatorClient.send(COORDINATOR_MESSAGE_PATTERNS.ADD_VOTERS_TO_ELECTION, dto))
    }

    async startElection(dto: MongoIdDto) {
        return lastValueFrom(this.coordinatorClient.send(COORDINATOR_MESSAGE_PATTERNS.START_ELECTION, dto))
    }

    async endElection(dto: MongoIdDto) {
        return lastValueFrom(this.coordinatorClient.send(COORDINATOR_MESSAGE_PATTERNS.END_ELECTION, dto))
    }

    async getElectionById(dto: MongoIdDto) {
        return lastValueFrom(this.coordinatorClient.send(COORDINATOR_MESSAGE_PATTERNS.GET_ELECTION_BY_ID, dto))
    }

    //SECTION - Coordinator - Vote
    async startVoteSession(dto: StartSessionDto) {
        return lastValueFrom(this.coordinatorClient.send(COORDINATOR_MESSAGE_PATTERNS.START_SESSION, dto))
    }

    async signBlindedVote(dto: SignBlindedVoteDto) {
        return lastValueFrom(this.coordinatorClient.send(COORDINATOR_MESSAGE_PATTERNS.SIGN_BLINDED_VOTE, dto))
    }

    async submitUnblindedVote(dto: SubmitUnblindedVoteDto) {
        return lastValueFrom(this.coordinatorClient.send(COORDINATOR_MESSAGE_PATTERNS.SUBMIT_UNBLINDED_VOTE, dto))
    }
}
