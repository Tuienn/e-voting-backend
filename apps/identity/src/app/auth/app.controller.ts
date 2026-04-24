import { Controller } from '@nestjs/common'
import { AppService } from './app.service'
import { MessagePattern, Payload } from '@nestjs/microservices'
import { SignInDto, RefreshTokenDto } from '@libs/types/identity/auth.dto'
import { IDENTITY_MESSAGE_PATTERNS } from '@libs/constants/message-patterns.constant'

@Controller()
export class AppController {
    constructor(private readonly authService: AppService) {}

    @MessagePattern(IDENTITY_MESSAGE_PATTERNS.SIGN_IN)
    async signIn(@Payload() data: SignInDto) {
        return await this.authService.signIn(data)
    }

    @MessagePattern(IDENTITY_MESSAGE_PATTERNS.REFRESH_TOKEN)
    async refreshToken(@Payload() data: RefreshTokenDto) {
        return await this.authService.refreshToken(data)
    }

    @MessagePattern(IDENTITY_MESSAGE_PATTERNS.SIGN_OUT)
    async signOut(@Payload() data: RefreshTokenDto) {
        return await this.authService.signOut(data)
    }
}
