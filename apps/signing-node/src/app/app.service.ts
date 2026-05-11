import { ElectionIdDto, SessionIdDto, SignPartialDto } from '@libs/types/signing-node/app.dto'
import { Injectable } from '@nestjs/common'
import { CryptoService } from '../infrastructure/crypto/crypto.service'
import { CONFIGURATION } from '../configuration'
import { PrismaService } from '../infrastructure/prisma/prisma.service'
import { handlePrismaError } from '@libs/utils/handle-prisma-error.util'

@Injectable()
export class AppService {
    constructor(
        private readonly cryptoService: CryptoService,
        private readonly prisma: PrismaService
    ) {}

    async createCommitment(dto: SessionIdDto) {
        const result = await this.cryptoService.createCommitment(dto.sessionId)
        return {
            nodeId: CONFIGURATION.SIGNING_NODE_CONFIG.NODE_ID,
            cI: result.cI,
            rhoI: result.rhoI
        }
    }

    async signPartial(dto: SignPartialDto) {
        return await this.prisma.$transaction(async (tx) => {
            //SECTION - Atomic dedup TRƯỚC khi ký:
            // Unique index (electionId, voterId) đảm bảo voter chỉ được node này ký
            // đúng 1 lần cho 1 election. Nếu bất kỳ node nào từ chối → coordinator
            // không aggregate được, voter không thể tích lũy nhiều chữ ký để reveal
            // nhiều phiếu.
            try {
                await tx.signedVoter.create({
                    data: {
                        electionId: dto.electionId,
                        voterId: dto.voterId,
                        sessionId: dto.sessionId
                    }
                })
            } catch (e) {
                handlePrismaError(e, [{ code: 'P2002', message: 'Voter has already signed for this election' }])
            }

            //NOTE - Sau khi đã chốt slot dedup, mới gọi crypto sign. Nếu sign fail
            // (nonce hết hạn, rHex sai...), signedVoter đựoc rollback, nên voter có thể thử lại
            const result = await this.cryptoService.signPartial(dto.sessionId, dto.rHex)

            return {
                nodeId: CONFIGURATION.SIGNING_NODE_CONFIG.NODE_ID,
                sI: result.sI
            }
        })
    }

    async deleteSessionNonce(dto: SessionIdDto) {
        //SECTION - Xóa session nonce sau khi ký và sau khi user start session lần 2 để chống Nonce reuse (tấn công phục hồi private key)
        await this.cryptoService.deleteSessionNonce(dto.sessionId)
    }

    async getNodeInfo() {
        return {
            nodeId: CONFIGURATION.SIGNING_NODE_CONFIG.NODE_ID,
            publicKey: this.cryptoService.getPublicKey()
        }
    }

    async cleanupElection(dto: ElectionIdDto) {
        await this.prisma.signedVoter.deleteMany({
            where: { electionId: dto.electionId }
        })
    }
}
