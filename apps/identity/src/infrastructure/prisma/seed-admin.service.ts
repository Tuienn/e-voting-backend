import { CONFIGURATION } from '../../configuration'
import { PrismaService } from './prisma.service'
import { Role } from '../../../generated/prisma/enums'
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common'
import { hash } from 'argon2'

@Injectable()
export class SeedAdminService implements OnApplicationBootstrap {
    private readonly logger = new Logger(SeedAdminService.name)
    constructor(private readonly prisma: PrismaService) {}

    async onApplicationBootstrap() {
        await this.seedAdminDefault()
    }

    private async seedAdminDefault() {
        const adminEmail = CONFIGURATION.IDENTITY_CONFIG.DEFAULT_ADMIN_EMAIL
        const adminPassword = CONFIGURATION.IDENTITY_CONFIG.DEFAULT_ADMIN_PASSWORD

        const existingAdmin = await this.prisma.user.findFirst({
            where: {
                email: adminEmail,
                role: Role.ADMIN
            }
        })

        if (existingAdmin) {
            this.logger.log(`Admin with email ${adminEmail} already exists`)
            return
        }

        const hashedPassword = await hash(adminPassword)

        await this.prisma.user.create({
            data: {
                email: adminEmail,
                password: hashedPassword,
                role: Role.ADMIN,
                name: 'Admin'
            }
        })

        this.logger.log(`Admin with email ${adminEmail} created successfully`)
    }
}
