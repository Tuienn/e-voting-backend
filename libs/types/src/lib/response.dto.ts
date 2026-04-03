import { HTTP_MESSAGE_TITLES } from '@libs/constants/http.constant'
import { HttpStatus } from '@nestjs/common'
import { ApiProperty } from '@nestjs/swagger'

export class ResponseDto<T> {
    @ApiProperty({ type: 'string', example: HTTP_MESSAGE_TITLES.OK })
    title?: string

    @ApiProperty({ type: 'string', example: 'OK' })
    message?: string

    @ApiProperty()
    data?: T

    @ApiProperty({ type: 'number', example: HttpStatus.OK })
    statusCode: number

    constructor(data: Partial<ResponseDto<T>>) {
        this.title =
            data.title ||
            HTTP_MESSAGE_TITLES[HttpStatus[data.statusCode ?? HttpStatus.OK] as keyof typeof HTTP_MESSAGE_TITLES]
        this.message = data.message || this.title
        this.data = data.data
        this.statusCode = data.statusCode || HttpStatus.OK
    }
}
