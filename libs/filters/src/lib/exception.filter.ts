import { HTTP_MESSAGE_TITLES } from '@libs/constants/http.constant'
import { ResponseDto } from '@libs/types/response.dto'
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Injectable } from '@nestjs/common'
import { Response } from 'express'

@Injectable()
@Catch()
export class ExceptionFilterHandler implements ExceptionFilter {
    catch(exception: unknown, host: ArgumentsHost): void {
        if (host.getType() !== 'http') {
            throw exception
        }

        const response = host.switchToHttp().getResponse<Response>()
        const statusCode =
            exception instanceof HttpException
                ? exception.getStatus()
                : ((exception as any)?.statusCode ?? (exception as any)?.code ?? HttpStatus.INTERNAL_SERVER_ERROR)
        const title =
            HTTP_MESSAGE_TITLES[HttpStatus[statusCode] as keyof typeof HTTP_MESSAGE_TITLES] ||
            HTTP_MESSAGE_TITLES.INTERNAL_SERVER_ERROR
        const message = this.getMessage(exception, title)

        response.status(statusCode).json(
            new ResponseDto({
                title,
                message,
                statusCode,
                data: null
            })
        )
    }

    private getMessage(exception: unknown, fallbackMessage: string): string {
        if (exception instanceof HttpException) {
            const errorResponse = exception.getResponse()

            if (typeof errorResponse === 'string') {
                return errorResponse
            }

            if (typeof errorResponse === 'object' && errorResponse !== null) {
                const message = (errorResponse as { message?: string | string[] }).message

                if (message) {
                    return Array.isArray(message) ? message.join(', ') : message
                }
            }
        }

        const message = (exception as { message?: string | string[] })?.message

        if (Array.isArray(message)) {
            return message.join(', ')
        }

        return message || fallbackMessage
    }
}
