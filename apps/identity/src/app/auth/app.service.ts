import { RefreshTokenDto, SignInDto } from '@libs/types/identity/auth.dto'
import { Injectable, UnauthorizedException } from '@nestjs/common'
import { AppService as UserService } from '../user/app.service'
import { TokenService } from '../../infrastructure/token/token.service'
import { AUTH_TEXT } from '@libs/constants/text.constant'
import { verify } from 'argon2'
@Injectable()
export class AppService {
    constructor(
        private readonly usersService: UserService,
        private readonly tokenService: TokenService
    ) {}

    async signIn(dto: SignInDto) {
        const user = await this.usersService.getUserByEmail({ email: dto.email })
        if (!user) {
            throw new UnauthorizedException(AUTH_TEXT.INVALID_CREDENTIALS)
        }

        const isPasswordMatch = await verify(user.password, dto.password)
        if (!isPasswordMatch) {
            throw new UnauthorizedException(AUTH_TEXT.INVALID_CREDENTIALS)
        }

        return this.tokenService.generateTokens({ userId: user.id, email: user.email, role: user.role })
    }

    async refreshToken(dto: RefreshTokenDto) {
        return await this.tokenService.rotateRefreshToken(dto.refreshToken)
    }

    async signOut(dto: RefreshTokenDto) {
        await this.tokenService.revokeRefreshToken(dto.refreshToken)
    }
}
