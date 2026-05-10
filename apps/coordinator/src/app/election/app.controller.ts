import { COORDINATOR_MESSAGE_PATTERNS } from '@libs/constants/message-patterns.constant'
import { Controller } from '@nestjs/common'
import { AppService } from './app.service'
import { MessagePattern, Payload } from '@nestjs/microservices'
import {
    GetVoterInElectionDto,
    CreateElectionDto,
    FilterElectionsDto,
    VoterIdsDto
} from '@libs/types/coordinator/election.dto'
import { MongoIdDto } from '@libs/types/common.dto'

@Controller()
export class AppController {
    constructor(private readonly appService: AppService) {}

    @MessagePattern(COORDINATOR_MESSAGE_PATTERNS.FILTER_ELECTIONS)
    async filterElections(@Payload() dto: FilterElectionsDto) {
        return await this.appService.filterElections(dto)
    }

    @MessagePattern(COORDINATOR_MESSAGE_PATTERNS.CREATE_ELECTION)
    async createElection(@Payload() dto: CreateElectionDto) {
        return await this.appService.createElection(dto)
    }

    @MessagePattern(COORDINATOR_MESSAGE_PATTERNS.ADD_VOTERS_TO_ELECTION)
    async addVotersToElection(@Payload() dto: MongoIdDto & VoterIdsDto) {
        return await this.appService.addVotersToElection(dto)
    }

    @MessagePattern(COORDINATOR_MESSAGE_PATTERNS.START_ELECTION)
    async startElection(@Payload() dto: MongoIdDto) {
        return await this.appService.startElection(dto)
    }

    @MessagePattern(COORDINATOR_MESSAGE_PATTERNS.END_ELECTION)
    async closeElection(@Payload() dto: MongoIdDto) {
        return await this.appService.closeElection(dto)
    }

    @MessagePattern(COORDINATOR_MESSAGE_PATTERNS.COMPLETE_ELCTION)
    async completeElection(@Payload() dto: MongoIdDto) {
        return await this.appService.completeElection(dto)
    }

    @MessagePattern(COORDINATOR_MESSAGE_PATTERNS.GET_ELECTION_BY_ID)
    async getElectionById(@Payload() dto: MongoIdDto) {
        return await this.appService.getElectionById(dto)
    }

    @MessagePattern(COORDINATOR_MESSAGE_PATTERNS.GET_VOTER_IN_ELECTION)
    async checkVoterInElection(@Payload() dto: GetVoterInElectionDto) {
        return await this.appService.getVoterInElection(dto)
    }

    @MessagePattern(COORDINATOR_MESSAGE_PATTERNS.COLLECTIVE_PUBLIC_KEY)
    async collectivePublicKey() {
        return await this.appService.collectivePublicKey()
    }
}
