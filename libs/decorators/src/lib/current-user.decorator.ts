// Decorator tiện lợi để lấy thông tin user từ header
import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import { RequestWithUser } from '@libs/types/identity/auth.type'

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): RequestWithUser => {
    const request = ctx.switchToHttp().getRequest()
    const user = request.user //NOTE - Thông tin user đã được gắn vào request trong AuthGuard
    return {
        userId: user?.sub,
        email: user?.email,
        role: user?.role
    }
})
