import { ResponseDto } from '@libs/types/response.dto'
import { CallHandler, ExecutionContext, HttpException, HttpStatus, Injectable, NestInterceptor } from '@nestjs/common'
import { catchError, Observable } from 'rxjs'
import { HTTP_MESSAGE_TITLES } from '@libs/constants/http.constant'

@Injectable()
export class ExceptionInterceptor implements NestInterceptor {
    intercept(context: ExecutionContext, next: CallHandler<any>): Observable<any> {
        if (context.getType() !== 'http') {
            return next.handle()
        }

        return next.handle().pipe(
            catchError((error) => {
                const statusCode =
                    error instanceof HttpException
                        ? error.getStatus()
                        : (error.statusCode ?? error.code ?? HttpStatus.INTERNAL_SERVER_ERROR)
                const title =
                    HTTP_MESSAGE_TITLES[HttpStatus[statusCode] as keyof typeof HTTP_MESSAGE_TITLES] ||
                    HTTP_MESSAGE_TITLES.INTERNAL_SERVER_ERROR
                const message = error.message || title

                throw new HttpException(
                    new ResponseDto({
                        title,
                        message,
                        statusCode,
                        data: null
                    }),
                    statusCode
                )
            })
        )
    }
}
