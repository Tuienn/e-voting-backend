// apps/auth-service/src/token/token.module.ts
import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { TokenService } from './token.service'

@Module({
    imports: [JwtModule.register({})], // không set secret ở đây, set per-call trong service
    providers: [TokenService],
    exports: [TokenService]
})
export class TokenModule {}
