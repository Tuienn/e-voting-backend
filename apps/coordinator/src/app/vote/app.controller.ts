import { BadRequestException, Controller } from '@nestjs/common'
import { AppService } from './app.service'
import { SignBlindedVoteDto, StartSessionDto, SubmitUnblindedVoteDto } from '@libs/types/coordinator/vote.dto'
import { MessagePattern, Payload } from '@nestjs/microservices'
import { COORDINATOR_MESSAGE_PATTERNS } from '@libs/constants/message-patterns.constant'
import { isValidHex } from '@libs/schnorr-blind'

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
    async submitUnblindedVote(@Payload() dto: SubmitUnblindedVoteDto) {
        if (!isValidHex(dto.signatureHex) || !isValidHex(dto.bindedVoteHash)) {
            throw new BadRequestException('Invalid signatureHex or bindedVoteHash')
        }

        return await this.appService.submitUnblindedVote(dto)
    }
}
