import { Global, Module } from '@nestjs/common'
import { SeedAdminService } from './seed-admin.service'
import { PrismaService } from './prisma.service'

@Global()
@Module({
    providers: [PrismaService, SeedAdminService],
    exports: [PrismaService, SeedAdminService]
})
export class PrismaModule {}
