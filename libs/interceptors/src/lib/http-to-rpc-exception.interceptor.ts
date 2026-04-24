import { CallHandler, ExecutionContext, HttpException, Injectable, NestInterceptor } from '@nestjs/common'
import { RpcException } from '@nestjs/microservices'
import { Observable, throwError } from 'rxjs'
import { catchError } from 'rxjs/operators'

const toRpcPayload = (exception: HttpException): { status: number; message: string } => {
    const status = exception.getStatus()
    const response = exception.getResponse()
    let message: string
    if (typeof response === 'string') {
        message = response
    } else if (typeof response === 'object' && response !== null) {
        const r = response as Record<string, unknown>
        if (typeof r['message'] === 'string') {
            message = r['message']
        } else if (Array.isArray(r['message'])) {
            message = r['message'].join('; ')
        } else {
            message = exception.message
        }
    } else {
        message = exception.message
    }
    return { status, message }
}

/**
 * TCP microservices do not apply HTTP exception filters. Nest's RPC layer only preserves
 * structured errors for {@link RpcException}; plain {@link HttpException} becomes an opaque 500.
 * This interceptor maps HTTP exceptions to RpcException so TCP clients receive status + message.
 */
@Injectable()
export class HttpToRpcExceptionInterceptor implements NestInterceptor {
    intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
        if (context.getType() !== 'rpc') {
            return next.handle()
        }

        return next.handle().pipe(
            catchError((err: unknown) => {
                if (err instanceof HttpException) {
                    const { status, message } = toRpcPayload(err)
                    return throwError(() => new RpcException({ status, message }))
                }
                return throwError(() => err)
            })
        )
    }
}
