import { BadRequestException, Controller } from '@nestjs/common'
import { AppService } from './app.service'
import {
    SignBlindedVoteDto,
    StartSessionDto,
    SubmitBlindedCommitmentDto,
    VerifyVoteDto
} from '@libs/types/coordinator/vote.dto'
import { MessagePattern, Payload } from '@nestjs/microservices'
import { COORDINATOR_MESSAGE_PATTERNS } from '@libs/constants/message-patterns.constant'
import { getParams, isReasonableHexLength, isValidScalarHex } from '@libs/ec-schnorr'
import { MongoIdDto } from '@libs/types/common.dto'
import { invalidDataField } from '@libs/constants/text.constant'

@Controller()
export class AppController {
    constructor(private readonly appService: AppService) {}

    @MessagePattern(COORDINATOR_MESSAGE_PATTERNS.GET_VOTE_COUNT)
    async getVoteCount(@Payload() dto: MongoIdDto) {
        return await this.appService.getVoteCount(dto)
    }

    @MessagePattern(COORDINATOR_MESSAGE_PATTERNS.START_SESSION)
    async startSession(@Payload() dto: StartSessionDto) {
        return await this.appService.startSession(dto)
    }

    @MessagePattern(COORDINATOR_MESSAGE_PATTERNS.SIGN_BLINDED_VOTE)
    async signBlindedVote(@Payload() dto: SignBlindedVoteDto) {
        const ecParams = getParams()

        if (!isReasonableHexLength(dto.rHex, ecParams.SCALAR_BYTES + 4)) {
            throw new BadRequestException('Invalid rHex length')
        }

        return await this.appService.signBlindedVote(dto, ecParams)
    }

    @MessagePattern(COORDINATOR_MESSAGE_PATTERNS.SUBMIT_BLINDED_COMMITMENT)
    async submitBlindedCommitment(@Payload() dto: SubmitBlindedCommitmentDto) {
        const ecParams = getParams()

        if (!isValidScalarHex(dto.signatureHex, ecParams.n)) {
            throw new BadRequestException(invalidDataField('signatureHex', 'hex string of scalar'))
        }

        return await this.appService.submitBlindedCommitment(dto)
    }

    @MessagePattern(COORDINATOR_MESSAGE_PATTERNS.VERIFY_VOTE)
    async verifyVote(@Payload() dto: VerifyVoteDto) {
        return await this.appService.verifyVote(dto)
    }
}
