import { HttpException, HttpStatus } from '@nestjs/common'

//NOTE- Maps TCP microservice client error payload (from Nest RpcException) to an HTTP exception.
export const httpExceptionFromMicroserviceClientError = (err: unknown): HttpException => {
    if (typeof err !== 'object' || err === null) {
        return new HttpException('Internal server error', HttpStatus.INTERNAL_SERVER_ERROR)
    }
    const { status: rawStatus, message: rawMessage } = err as Record<string, unknown>
    const httpStatus =
        typeof rawStatus === 'number' && rawStatus >= 100 && rawStatus < 600
            ? rawStatus
            : HttpStatus.INTERNAL_SERVER_ERROR
    const message = typeof rawMessage === 'string' ? rawMessage : 'Internal server error'
    return new HttpException(message, httpStatus)
}
