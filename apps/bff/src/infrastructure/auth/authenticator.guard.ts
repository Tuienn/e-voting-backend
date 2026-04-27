import { JwtPayload } from '@libs/types/identity/auth.type'
import { AUTH_TEXT } from '@libs/constants/text.constant'
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { JwtService } from '@nestjs/jwt'
import { CONFIGURATION } from '../../configuration'
import { AppService as IdentityService } from '../../app/identity/app.service'

@Injectable()
export class AuthenticatorGuard implements CanActivate {
    constructor(
        private readonly jwtService: JwtService,
        private readonly reflector: Reflector, //NOTE - Sử dụng Reflector để đọc metadata từ decorator @Public() được gắn trên controller/route handler
        private readonly identityService: IdentityService
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        //SECTION - Kiểm tra nếu route được đánh dấu là @Public thì không cần xác thực JWT, cho phép truy cập ngay
        const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [
            context.getHandler(),
            context.getClass()
        ])

        if (isPublic) {
            return true
        }

        //SECTION - Xử lý xác thực JWT cho cả HTTP và RPC
        const request = context.switchToHttp().getRequest()
        const [type, token] = (request.headers['authorization'] || '').split(' ')

        if (type !== 'Bearer' || !token) {
            throw new UnauthorizedException(AUTH_TEXT.ACCESS_TOKEN_REQUIRED)
        }

        let payload: JwtPayload
        try {
            payload = this.jwtService.verify(token, {
                secret: CONFIGURATION.BFF_CONFIG.JWT_ACCESS_SECRET
            })
        } catch {
            throw new UnauthorizedException(AUTH_TEXT.INVALID_ACCESS_TOKEN)
        }

        //SECTION - Kiểm tra userId có tồn tại trong payload không
        if (!payload.sub) {
            throw new UnauthorizedException(AUTH_TEXT.USER_ID_REQUIRED)
        }

        //SECTION - Kiểm tra user có tồn tại không
        const userExists = await this.identityService.getUserById({ id: payload.sub })

        if (!userExists || !userExists?.id) {
            throw new UnauthorizedException(AUTH_TEXT.USER_NOT_FOUND)
        }

        //SECTION - Gắn thông tin payload đã giải mã vào request để các phần sau có thể sử dụng
        request['user'] = payload

        return true
    }
}
