import { HttpException, HttpStatus } from '@nestjs/common'

//NOTE- Maps TCP microservice client error payload (RpcException / HttpException JSON) to an HTTP exception.
export const rpcErrorToHttp = (err: unknown): HttpException => {
    if (typeof err !== 'object' || err === null) {
        return new HttpException('Internal server error', HttpStatus.INTERNAL_SERVER_ERROR)
    }
    const rec = err as Record<string, unknown>

    let rawStatus: unknown = rec['status'] ?? rec['statusCode']
    let rawMessage: unknown = rec['message']

    const nested = rec['error']
    if (typeof nested === 'object' && nested !== null) {
        const e = nested as Record<string, unknown>
        if (rawStatus === undefined) rawStatus = e['status']
        if (rawMessage === undefined) rawMessage = e['message']
    }

    const response = rec['response']
    if (typeof response === 'object' && response !== null) {
        const resp = response as Record<string, unknown>
        if (rawStatus === undefined) rawStatus = resp['statusCode']
        if (rawMessage === undefined) {
            if (typeof resp['message'] === 'string') rawMessage = resp['message']
            else if (Array.isArray(resp['message'])) rawMessage = resp['message'].join('; ')
        }
    }

    const httpStatus =
        typeof rawStatus === 'number' && rawStatus >= 100 && rawStatus < 600
            ? rawStatus
            : HttpStatus.INTERNAL_SERVER_ERROR
    const message = typeof rawMessage === 'string' ? rawMessage : 'Internal server error'
    return new HttpException(message, httpStatus)
}
