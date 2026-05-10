import { Controller } from '@nestjs/common'
import { AppService } from './app.service'
import {
    GetVoteByBlindedHashDto,
    SignBlindedVoteDto,
    StartSessionDto,
    SubmitBlindedVoteHashDto,
    UpdateRevealedStatusDto
} from '@libs/types/coordinator/vote.dto'
import { MessagePattern, Payload } from '@nestjs/microservices'
import { COORDINATOR_MESSAGE_PATTERNS } from '@libs/constants/message-patterns.constant'
import { MongoIdDto } from '@libs/types/common.dto'

@Controller()
export class AppController {
    constructor(private readonly appService: AppService) {}

    @MessagePattern(COORDINATOR_MESSAGE_PATTERNS.START_SESSION)
    async startSession(@Payload() dto: StartSessionDto) {
        return await this.appService.startSession(dto)
    }

    @MessagePattern(COORDINATOR_MESSAGE_PATTERNS.SIGN_BLINDED_VOTE)
    async signBlindedVote(@Payload() dto: SignBlindedVoteDto) {
        return await this.appService.signBlindedVote(dto)
    }

    @MessagePattern(COORDINATOR_MESSAGE_PATTERNS.SUBMIT_UNBLINDED_VOTE)
    async submitBlindedVoteHash(@Payload() dto: SubmitBlindedVoteHashDto) {
        return await this.appService.submitBlindedVoteHash(dto)
    }

    @MessagePattern(COORDINATOR_MESSAGE_PATTERNS.GET_VOTE_BY_BLINDED_HASH)
    async getVoteByBlindedHash(@Payload() dto: GetVoteByBlindedHashDto) {
        return await this.appService.getVoteByBlindedHash(dto)
    }

    @MessagePattern(COORDINATOR_MESSAGE_PATTERNS.UPDATE_REVEALED_STATUS)
    async updateRevealedStatus(@Payload() dto: UpdateRevealedStatusDto) {
        return await this.appService.updateRevealedStatus(dto)
    }

    @MessagePattern(COORDINATOR_MESSAGE_PATTERNS.CHECK_EXIST_UNREVEALED_VOTE)
    async checkExistUnrevealedVote(@Payload() dto: MongoIdDto) {
        return await this.appService.checkExistUnrevealedVote(dto)
    }
}
