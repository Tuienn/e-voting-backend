import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { PrismaClient } from '../../generated/prisma/client'

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger('Prisma')

    async onModuleInit() {
        try {
            await this.$connect()
            await this.$runCommandRaw({ ping: 1 }) // Kiểm tra kết nối MongoDB
            this.logger.log('🚀 Connected to database')
        } catch (error) {
            this.logger.error('❌ Failed to connect', error)
            throw error // NestJS dừng app
        }
    }

    async onModuleDestroy() {
        await this.$disconnect()
        this.logger.warn('[DB] 🔌 Disconnected from database')
    }
}
