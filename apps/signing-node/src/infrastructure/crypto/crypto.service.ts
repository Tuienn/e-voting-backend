import { CACHE_MANAGER, Cache } from '@nestjs/cache-manager'
import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { CONFIGURATION } from '../../configuration'
import {
    getParams,
    generateKeyPair,
    type EcPoint,
    pointToHex,
    generateCommitment,
    EcParams,
    signPartial,
    hexToScalar,
    scalarToHex,
    hexToPoint
} from '@libs/ec-schnorr'
import { loadKeysFromJsonFile, saveKeysToJsonFile } from '../utils/key-file-handler.util'

@Injectable()
export class CryptoService {
    private readonly params: EcParams
    private readonly publicKey: EcPoint
    private readonly privateKey: bigint
    private readonly logger = new Logger(CONFIGURATION.SERVICE_NAME)

    constructor(@Inject(CACHE_MANAGER) private readonly cacheManager: Cache) {
        const ecParams = getParams()

        this.params = ecParams

        const existingKeys = loadKeysFromJsonFile(`keys/${CONFIGURATION.SIGNING_NODE_CONFIG.NODE_ID}.json`)
        if (existingKeys && existingKeys.privateKey && existingKeys.publicKey) {
            this.privateKey = hexToScalar(existingKeys.privateKey)
            this.publicKey = hexToPoint(existingKeys.publicKey, ecParams)
        } else {
            const { privateKey, publicKey } = generateKeyPair(ecParams)
            this.privateKey = privateKey
            this.publicKey = publicKey

            this.logger.warn('No existing keys found, generated new key pair')

            saveKeysToJsonFile({
                fileName: CONFIGURATION.SIGNING_NODE_CONFIG.NODE_ID,
                data: {
                    privateKey: scalarToHex(this.privateKey),
                    publicKey: pointToHex(this.publicKey)
                }
            })
        }

        this.logger.debug('CryptoService initialized')
        this.logger.debug(`Public Key: ${pointToHex(this.publicKey).substring(0, 20)}...`)
        this.logger.debug(`Private Key: ${scalarToHex(this.privateKey).substring(0, 20)}...`)
    }

    getPublicKey(): string {
        return pointToHex(this.publicKey)
    }

    async deleteSessionNonce(sessionId: string) {
        await this.cacheManager.del(`session:nonce:${CONFIGURATION.SERVICE_NAME}:${sessionId}`)
    }

    private async setSessionNonce(sessionId: string, nonce: bigint) {
        //NOTE - 1 thời điểm chỉ có 1 commitment với 1 session nonce chống Nonce reuse (tấn công phục hồi private key)
        const existNonce = await this.cacheManager.get<string>(
            `session:nonce:${CONFIGURATION.SERVICE_NAME}:${sessionId}`
        )

        if (existNonce) {
            throw new ConflictException('Session:nonce already exists')
        }

        await this.cacheManager.set(
            `session:nonce:${CONFIGURATION.SERVICE_NAME}:${sessionId}`,
            scalarToHex(nonce),
            CONFIGURATION.SIGNING_NODE_CONFIG.REDIS_CACHE_TTL
        )
    }

    private async getSessionNonce(sessionId: string): Promise<bigint> {
        const nonce = await this.cacheManager.get<string>(`session:nonce:${CONFIGURATION.SERVICE_NAME}:${sessionId}`)

        if (!nonce) {
            throw new NotFoundException('Session:nonce not found or expired')
        }

        //NOTE - xóa nonce sau khi lấy để chống Nonce reuse (tấn công phục hồi private key)
        await this.deleteSessionNonce(sessionId)
        return hexToScalar(nonce)
    }

    async createCommitment(sessionId: string): Promise<{ cI: string; rhoI: string }> {
        const { nonce, commitment } = generateCommitment(this.params)
        await this.setSessionNonce(sessionId, nonce)

        return {
            cI: pointToHex(commitment),
            rhoI: pointToHex(this.publicKey)
        }
    }

    async signPartial(sessionId: string, rHex: string): Promise<{ sI: string }> {
        const nonce = await this.getSessionNonce(sessionId)
        const r = hexToScalar(rHex)
        const sI = signPartial(nonce, this.privateKey, r, this.params)

        return {
            sI: scalarToHex(sI)
        }
    }
}
