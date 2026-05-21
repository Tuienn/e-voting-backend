import { SIGNING_NODE_MESSAGE_PATTERNS } from '@libs/constants/message-patterns.constant'
import { BadRequestException, Controller } from '@nestjs/common'
import { AppService } from './app.service'
import { EventPattern, MessagePattern, Payload } from '@nestjs/microservices'
import { SessionIdDto, SignPartialDto } from '@libs/types/signing-node/app.dto'
import { getParams, isReasonableHexLength, isValidScalarHex } from '@libs/ec-schnorr'
import { invalidDataField } from '@libs/constants/text.constant'
import { ElectionIdDto } from '@libs/types/common.dto'

@Controller()
export class AppController {
    constructor(private readonly appService: AppService) {}

    @MessagePattern(SIGNING_NODE_MESSAGE_PATTERNS.GENERATE_KEY_PAIR)
    async generateKeyPairForElection(@Payload() dto: ElectionIdDto) {
        return await this.appService.generateKeyPairForElection(dto.electionId)
    }

    @MessagePattern(SIGNING_NODE_MESSAGE_PATTERNS.CREATE_COMMITMENT)
    async createCommitment(@Payload() dto: SessionIdDto & ElectionIdDto) {
        return await this.appService.createCommitment(dto)
    }

    @MessagePattern(SIGNING_NODE_MESSAGE_PATTERNS.SIGN_PARTIAL)
    async signPartial(@Payload() dto: SignPartialDto) {
        const params = getParams()
        //NOTE - kiểm tra độ dài của rHex không vượt quá SCALAR_BYTES + 4 (4 bytes cho trường hợp hex có prefix '0x' và 1 số trường hợp edge khác)
        if (!isReasonableHexLength(dto.rHex, params.SCALAR_BYTES + 4)) {
            throw new BadRequestException('Invalid rHex length')
        }

        //NOTE - kiểm tra rHex có nằm trong range [1, q-1] không
        if (!isValidScalarHex(dto.rHex, params.n)) {
            throw new BadRequestException(invalidDataField('rHex', 'hex string of scalar'))
        }

        return await this.appService.signPartial(dto)
    }

    @EventPattern(SIGNING_NODE_MESSAGE_PATTERNS.DELETE_SESSION_NONCE)
    async deleteSessionNonce(@Payload() dto: SessionIdDto) {
        await this.appService.deleteSessionNonce(dto)
    }

    @EventPattern(SIGNING_NODE_MESSAGE_PATTERNS.CLEANUP_ELECTION)
    async cleanupElection(@Payload() dto: ElectionIdDto) {
        await this.appService.cleanupElection(dto)
    }
}
