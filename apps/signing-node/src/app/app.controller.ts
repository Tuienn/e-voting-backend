import { SIGNING_NODE_MESSAGE_PATTERNS } from '@libs/constants/message-patterns.constant'
import { BadRequestException, Controller } from '@nestjs/common'
import { AppService } from './app.service'
import { MessagePattern, Payload } from '@nestjs/microservices'
import { SessionIdDto, SignPartialDto } from '@libs/types/signing-node/app.dto'
import { isReasonableHexLength, isValidBNHex } from '@libs/schnorr-blind'
import { CryptoService } from '../infrastructure/crypto/crypto.service'

@Controller()
export class AppController {
    constructor(
        private readonly appService: AppService,
        private readonly cryptoService: CryptoService
    ) {}

    @MessagePattern(SIGNING_NODE_MESSAGE_PATTERNS.CREATE_COMMITMENT)
    async createCommitment(@Payload() dto: SessionIdDto) {
        return await this.appService.createCommitment(dto)
    }

    @MessagePattern(SIGNING_NODE_MESSAGE_PATTERNS.SIGN_PARTIAL)
    async signPartial(@Payload() dto: SignPartialDto) {
        const { qByteLen, q } = this.cryptoService.getParams()
        //NOTE- kiểm tra độ dài của rHex không vượt quá qByteLen
        if (!isReasonableHexLength(dto.rHex, qByteLen + 8)) {
            throw new BadRequestException('Invalid rHex length')
        }

        //NOTE- kiểm tra rHex có nằm trong range [1, q-1] không
        if (!isValidBNHex(dto.rHex, q)) {
            throw new BadRequestException('rHex must be in range [1, q-1]')
        }

        return await this.appService.signPartial(dto)
    }

    @MessagePattern(SIGNING_NODE_MESSAGE_PATTERNS.GET_NODE_INFO)
    async getNodeInfo() {
        return await this.appService.getNodeInfo()
    }
}
