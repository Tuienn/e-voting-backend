import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Role } from '@libs/types/identity/auth.type'
import { ROLES_KEY } from '@libs/constants/common.constant'

@Injectable()
export class AuthorizationGuard implements CanActivate {
    constructor(private reflector: Reflector) {}

    canActivate(context: ExecutionContext): boolean {
        //SECTION - Kiểm tra nếu route được đánh dấu là @Public thì không cần xác thực JWT, cho phép truy cập ngay
        const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [
            context.getHandler(),
            context.getClass()
        ])

        if (isPublic) {
            return true
        }

        const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
            context.getHandler(),
            context.getClass()
        ])
        if (!requiredRoles) {
            return true
        }

        const { user } = context.switchToHttp().getRequest()
        const hasRequiredRole = requiredRoles.includes(user?.role)

        if (!hasRequiredRole) {
            throw new ForbiddenException('You do not have permission to access this resource')
        }

        if (!user?.isActive) {
            throw new ForbiddenException('Your account is inactive. Please contact support.')
        }

        return true
    }
}
