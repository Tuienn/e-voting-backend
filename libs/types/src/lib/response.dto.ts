import { HTTP_MESSAGE_TITLES } from '@libs/constants/http.constant'
import { HttpStatus } from '@nestjs/common'

export class ResponseDto<T> {
    title = HTTP_MESSAGE_TITLES.OK
    message?: string
    data?: T
    statusCode = HttpStatus.OK

    constructor(data: Partial<ResponseDto<T>>) {
        Object.assign(this, data)
        this.message = this.message || this.title
    }
}
