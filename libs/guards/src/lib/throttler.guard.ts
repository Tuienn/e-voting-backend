import { ExecutionContext, Injectable } from '@nestjs/common'
import { ThrottlerGuard } from '@nestjs/throttler'

/**
 * Guard rate limiting chỉ áp dụng cho HTTP context.
 * Tự động bỏ qua các TCP/RPC request để không ảnh hưởng đến giao tiếp nội bộ giữa các microservice.
 */
@Injectable()
export class HttpThrottlerGuard extends ThrottlerGuard {
    override canActivate(context: ExecutionContext): Promise<boolean> {
        if (context.getType() !== 'http') {
            return Promise.resolve(true)
        }
        return super.canActivate(context)
    }
}
