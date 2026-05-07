import { CACHE_MANAGER, Cache } from '@nestjs/cache-manager'
import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { BN, generateCommitment, generateKeyPair, generateTestParams, signPartial } from '@libs/schnorr-blind'
import { CONFIGURATION } from '../../configuration'

@Injectable()
export class CryptoService {
    private readonly p: BN
    private readonly q: BN
    private readonly g: BN
    private readonly publicKey: BN
    private readonly privateKey: BN
    private readonly qByteLen: number
    private readonly logger = new Logger(CONFIGURATION.SERVICE_NAME)

    constructor(@Inject(CACHE_MANAGER) private readonly cacheManager: Cache) {
        const params = generateTestParams()

        this.p = params.p
        this.q = params.q
        this.g = params.g
        this.qByteLen = Math.ceil(params.q.bitLength() / 8)

        const keyPair = generateKeyPair(params.p, params.q, params.g)

        this.publicKey = keyPair.publicKey
        this.privateKey = keyPair.privateKey

        this.logger.debug('Crypto service initialized')
        this.logger.debug('p: ' + this.p.toString(16).substring(0, 20) + '...')
        this.logger.debug('q: ' + this.q.toString(16).substring(0, 20) + '...')
        this.logger.debug('g: ' + this.g.toString(16).substring(0, 20) + '...')
        this.logger.debug('qByteLen: ' + this.qByteLen)
        this.logger.debug('Public key ' + this.publicKey.toString(16).substring(0, 20) + '...')
        this.logger.debug('Private key ' + this.privateKey.toString(16).substring(0, 20) + '...')
    }

    getPublicKey(): BN {
        return this.publicKey
    }

    getPrivateKey(): BN {
        return this.privateKey
    }

    getParams() {
        return {
            p: this.p,
            q: this.q,
            g: this.g,
            qByteLen: this.qByteLen
        }
    }

    private async deleteSessionNonce(sessionId: string) {
        await this.cacheManager.del(`session:nonce:${CONFIGURATION.SERVICE_NAME}:${sessionId}`)
    }

    private async setSessionNonce(sessionId: string, nonce: BN) {
        //NOTE- 1 thời điểm chỉ có 1 commitment với 1 session nonce chống Nonce reuse (tấn công phục hồi private key)
        const existNonce = await this.cacheManager.get<string>(
            `session:nonce:${CONFIGURATION.SERVICE_NAME}:${sessionId}`
        )

        if (existNonce) {
            throw new ConflictException('Session:nonce already exists')
        }

        await this.cacheManager.set(
            `session:nonce:${CONFIGURATION.SERVICE_NAME}:${sessionId}`,
            nonce.toString(16),
            CONFIGURATION.SIGNING_NODE_CONFIG.REDIS_CACHE_TTL
        )
    }

    private async getSessionNonce(sessionId: string) {
        const nonceHex = await this.cacheManager.get<string>(`session:nonce:${CONFIGURATION.SERVICE_NAME}:${sessionId}`)

        if (!nonceHex) {
            throw new NotFoundException('Session:nonce not found or expired')
        }

        //NOTE- xóa nonce sau khi lấy để chống Nonce reuse (tấn công phục hồi private key)
        await this.deleteSessionNonce(sessionId)
        return new BN(nonceHex, 16)
    }

    async createCommitment(sessionId: string): Promise<{
        commitment: BN
        p: BN
        q: BN
        g: BN
    }> {
        const { nonce, commitment } = generateCommitment(this.p, this.q, this.g)
        await this.setSessionNonce(sessionId, nonce)

        return {
            commitment,
            p: this.p,
            q: this.q,
            g: this.g
        }
    }

    async signPartial(sessionId: string, rHex: string): Promise<BN> {
        const nonce = await this.getSessionNonce(sessionId)
        const r = new BN(rHex, 16)

        return signPartial(nonce, this.privateKey, r, this.q)
    }
}
