import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common'
import { Observable, throwError } from 'rxjs'
import { catchError } from 'rxjs/operators'
import { rpcErrorToHttp } from '@libs/utils/rpc-client-error.util'

//NOTE - Interceptor này dùng ở BFF để tự động chuyển đổi RPC error (từ TCP microservice) thành HttpException
@Injectable()
export class RpcToHttpExceptionInterceptor implements NestInterceptor {
    intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
        if (context.getType() !== 'http') {
            return next.handle()
        }

        return next.handle().pipe(catchError((err: unknown) => throwError(() => rpcErrorToHttp(err))))
    }
}
