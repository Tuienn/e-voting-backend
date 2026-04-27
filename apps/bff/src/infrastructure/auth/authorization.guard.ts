import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Role } from '@libs/types/identity/auth.type'

const ROLES_KEY = 'roles'

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
        return requiredRoles.includes(user?.role)
    }
}
