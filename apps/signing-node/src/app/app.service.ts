import { encrypt, decrypt } from '@libs/utils/crypto.util'
import { SessionIdDto, SignPartialDto } from '@libs/types/signing-node/app.dto'
import { BadGatewayException, Injectable, NotFoundException } from '@nestjs/common'
import { CryptoService } from '../infrastructure/crypto/crypto.service'
import { CONFIGURATION } from '../configuration'
import { PrismaService } from '../infrastructure/prisma/prisma.service'
import { handlePrismaError } from '@libs/utils/handle-prisma-error.util'
import { generateKeyPair, getParams, hexToPoint, hexToScalar, pointToHex, scalarToHex } from '@libs/ec-schnorr'
import { ElectionIdDto } from '@libs/types/common.dto'

@Injectable()
export class AppService {
    constructor(
        private readonly cryptoService: CryptoService,
        private readonly prisma: PrismaService
    ) {}

    private computeEncryptKeyBuf(): Buffer {
        const encryptKeyBuf = Buffer.from(CONFIGURATION.SIGNING_NODE_CONFIG.ENCRYPTION_KEY, 'base64')
        if (encryptKeyBuf.length !== 32) {
            throw new BadGatewayException('ENCRYPTION_KEY must be 32 bytes (256-bit) for AES-256')
        }
        return encryptKeyBuf
    }

    async generateKeyPairForElection(electionId: string): Promise<{ publicKey: string }> {
        //SECTION -  Nếu đã tồn tại key pair cho election này, trả về public key mà không tạo mới
        //NOTE - Tránh trường hợp cả 3 node cùng gen nhưng có 1 node fail -> khi gen lại thì lấy luôn key có sẵn
        const existing = await this.prisma.keyPair.findUnique({ where: { electionId } })
        if (existing) {
            return { publicKey: existing.publicKey }
        }

        const ecParams = getParams()
        const keyPair = generateKeyPair(ecParams)

        const encryptKeyBuf = this.computeEncryptKeyBuf()

        const publicKeyHex = pointToHex(keyPair.publicKey)

        try {
            await this.prisma.keyPair.create({
                data: {
                    electionId,
                    publicKey: publicKeyHex,
                    privateKey: encrypt(scalarToHex(keyPair.privateKey), encryptKeyBuf)
                }
            })
        } catch (e) {
            handlePrismaError(e, [{ code: 'P2002', message: 'Key pair for election already exists' }])
        }

        return {
            publicKey: publicKeyHex
        }
    }

    private async getPrivateKeyByElectionId(electionId: string): Promise<bigint> {
        const existKeyPair = await this.prisma.keyPair.findUnique({
            where: {
                electionId
            }
        })

        if (!existKeyPair) {
            throw new NotFoundException('Key pair for election not found')
        }

        const encryptKeyBuf = this.computeEncryptKeyBuf()
        const privateKeyHex = decrypt(existKeyPair.privateKey, encryptKeyBuf)
        const privateKey = hexToScalar(privateKeyHex)
        return privateKey
    }

    async createCommitment(dto: SessionIdDto & ElectionIdDto) {
        const existKey = await this.prisma.keyPair.findUnique({
            where: {
                electionId: dto.electionId
            }
        })

        if (!existKey) {
            throw new NotFoundException('Key pair for election not found')
        }

        const publicKey = hexToPoint(existKey.publicKey, getParams())

        const result = await this.cryptoService.createCommitment(dto.sessionId, publicKey)
        return {
            nodeId: CONFIGURATION.SIGNING_NODE_CONFIG.NODE_ID,
            cI: result.cI,
            rhoI: result.rhoI
        }
    }

    async signPartial(dto: SignPartialDto) {
        const privateKey = await this.getPrivateKeyByElectionId(dto.electionId)

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
            const result = await this.cryptoService.signPartial(dto.sessionId, dto.rHex, privateKey)

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

    async cleanupElection(dto: ElectionIdDto) {
        await this.prisma.signedVoter.deleteMany({
            where: { electionId: dto.electionId }
        })
        await this.prisma.keyPair.deleteMany({
            where: { electionId: dto.electionId }
        })
    }
}
