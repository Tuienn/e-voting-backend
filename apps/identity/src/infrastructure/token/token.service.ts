import { Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Cache } from '@nestjs/cache-manager'
import { Role } from '../../../generated/prisma/enums'
import { CONFIGURATION } from '../../configuration'
import { AUTH_TEXT } from '@libs/constants/text.constant'

type JwtPayload = {
    sub: string
    email: string
    role: Role
}

@Injectable()
export class TokenService {
    constructor(
        private readonly jwtService: JwtService,
        @Inject(CACHE_MANAGER) private cacheManager: Cache
    ) {}

    //SECTION - Tạo cặp access token và refresh token
    async generateTokens(payload: { userId: string; email: string; role: Role }) {
        const jwtPayload: JwtPayload = {
            sub: payload.userId,
            email: payload.email,
            role: payload.role
        }

        const [accessToken, refreshToken] = await Promise.all([
            this.jwtService.signAsync(jwtPayload, {
                secret: CONFIGURATION.IDENTITY_CONFIG.JWT_ACCESS_SECRET,
                expiresIn: CONFIGURATION.IDENTITY_CONFIG.JWT_ACCESS_EXPIRES_IN
            }),
            this.jwtService.signAsync(jwtPayload, {
                secret: CONFIGURATION.IDENTITY_CONFIG.JWT_REFRESH_SECRET,
                expiresIn: CONFIGURATION.IDENTITY_CONFIG.JWT_REFRESH_EXPIRES_IN
            })
        ])

        //NOTE - Lưu refresh token vào cache với key là userId
        await this.cacheManager.set(
            `refreshToken:${payload.userId}`,
            refreshToken,
            CONFIGURATION.IDENTITY_CONFIG.JWT_REFRESH_EXPIRES_IN
        ) // Lưu trong 7 ngày

        return { accessToken, refreshToken }
    }

    async rotateRefreshToken(oldRefreshToken: string) {
        Logger.debug(`Rotating refresh token: ${oldRefreshToken}`)
        let payload: JwtPayload
        try {
            payload = await this.jwtService.verifyAsync(oldRefreshToken, {
                secret: CONFIGURATION.IDENTITY_CONFIG.JWT_REFRESH_SECRET
            })
        } catch {
            throw new UnauthorizedException(AUTH_TEXT.INVALID_REFRESH_TOKEN)
        }

        const userId = payload.sub
        const cachedRefreshToken = await this.cacheManager.get<string>(`refreshToken:${userId}`)

        //NOTE - Kiểm tra refresh token gửi lên có khớp với refresh token đang lưu trong cache không
        if (!cachedRefreshToken || cachedRefreshToken !== oldRefreshToken) {
            throw new UnauthorizedException(AUTH_TEXT.INVALID_REFRESH_TOKEN)
        }

        //NOTE - Nếu hợp lệ thì tạo mới cặp token và lưu refresh token mới vào cache
        await this.cacheManager.del(`refreshToken:${userId}`) // Xóa refresh token cũ khỏi cache
        const newTokens = await this.generateTokens({ userId, email: payload.email, role: payload.role })
        return newTokens
    }

    async revokeRefreshToken(refreshToken: string) {
        let payload: JwtPayload
        try {
            payload = await this.jwtService.verifyAsync(refreshToken, {
                secret: CONFIGURATION.IDENTITY_CONFIG.JWT_REFRESH_SECRET
            })
        } catch {
            throw new UnauthorizedException(AUTH_TEXT.INVALID_REFRESH_TOKEN)
        }
        await this.cacheManager.del(`refreshToken:${payload.sub}`)
    }

    async verifyAccessToken(token: string) {
        try {
            const payload = await this.jwtService.verifyAsync(token, {
                secret: CONFIGURATION.IDENTITY_CONFIG.JWT_ACCESS_SECRET
            })
            return payload as JwtPayload
        } catch {
            throw new UnauthorizedException(AUTH_TEXT.INVALID_ACCESS_TOKEN)
        }
    }
}
