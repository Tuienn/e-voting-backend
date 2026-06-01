import { Injectable } from '@nestjs/common'
import * as argon2 from 'argon2'
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'
import { PrismaService } from '../../infrastructure/prisma/prisma.service'
import { handlePrismaError } from '@libs/utils/handle-prisma-error.util'
import { CONFIGURATION } from '../../configuration'
import { SaveVoteSecretBackupArgs } from '@libs/types/identity/auth.type'

const AT_REST_ALGO = 'aes-256-gcm'
const KEY_LENGTH = 32
const SALT_LENGTH = 16
const IV_LENGTH = 12

@Injectable()
export class AppService {
    constructor(private readonly prisma: PrismaService) {}

    // Dẫn khóa mã hóa-at-rest từ server-secret + salt theo từng record (argon2id, raw bytes).
    private async deriveAtRestKey(salt: Buffer): Promise<Buffer> {
        return argon2.hash(CONFIGURATION.IDENTITY_CONFIG.BACKUP_SECRET, {
            salt,
            raw: true,
            hashLength: KEY_LENGTH,
            type: argon2.argon2id
        })
    }

    async saveVoteSecretBackup({ userId, payload }: SaveVoteSecretBackupArgs) {
        const serverSalt = randomBytes(SALT_LENGTH)
        const iv = randomBytes(IV_LENGTH)
        const atKey = await this.deriveAtRestKey(serverSalt)

        const cipher = createCipheriv(AT_REST_ALGO, atKey, iv)
        const cipherText = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()])
        const authTag = cipher.getAuthTag()

        const data = {
            cipher: cipherText.toString('base64'),
            iv: iv.toString('base64'),
            authTag: authTag.toString('base64'),
            serverSalt: serverSalt.toString('base64'),
            version: 1
        }

        try {
            await this.prisma.voteSecretBackup.upsert({
                where: { userId },
                update: data,
                create: { userId, ...data }
            })

            return { updatedAt: new Date().toISOString() }
        } catch (e) {
            handlePrismaError(e)
        }
    }

    async getVoteSecretBackup({
        userId
    }: Pick<SaveVoteSecretBackupArgs, 'userId'>): Promise<{ payload: string } | null> {
        const record = await this.prisma.voteSecretBackup.findUnique({ where: { userId } })
        if (!record) return null

        const atKey = await this.deriveAtRestKey(Buffer.from(record.serverSalt, 'base64'))
        const decipher = createDecipheriv(AT_REST_ALGO, atKey, Buffer.from(record.iv, 'base64'))
        decipher.setAuthTag(Buffer.from(record.authTag, 'base64'))

        const payload = Buffer.concat([
            decipher.update(Buffer.from(record.cipher, 'base64')),
            decipher.final()
        ]).toString('utf8')

        return { payload }
    }
}
