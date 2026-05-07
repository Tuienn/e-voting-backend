import { SessionIdDto, SignPartialDto } from '@libs/types/signing-node/app.dto'
import { Injectable } from '@nestjs/common'
import { CryptoService } from '../infrastructure/crypto/crypto.service'
import { CONFIGURATION } from '../configuration'

@Injectable()
export class AppService {
    constructor(private readonly cryptoService: CryptoService) {}

    async createCommitment(dto: SessionIdDto) {
        const result = await this.cryptoService.createCommitment(dto.sessionId)
        return {
            nodeId: CONFIGURATION.SIGNING_NODE_CONFIG.NODE_ID,
            cI: result.commitment.toString(16),
            rhoI: this.cryptoService.getPublicKey().toString(16),
            p: result.p.toString(16),
            q: result.q.toString(16),
            g: result.g.toString(16)
        }
    }

    async signPartial(dto: SignPartialDto) {
        const sI = await this.cryptoService.signPartial(dto.sessionId, dto.rHex)
        return {
            nodeId: CONFIGURATION.SIGNING_NODE_CONFIG.NODE_ID,
            sI: sI.toString(16)
        }
    }

    async getNodeInfo() {
        return {
            nodeId: CONFIGURATION.SIGNING_NODE_CONFIG.NODE_ID,
            publicKey: this.cryptoService.getPublicKey().toString(16),
            params: this.cryptoService.getParams()
        }
    }
}
