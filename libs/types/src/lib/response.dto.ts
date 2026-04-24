import { HTTP_MESSAGE_TITLES } from '@libs/constants/http.constant'
import { HttpStatus } from '@nestjs/common'
import { IsNumber, IsOptional, IsString } from 'class-validator'

export class ResponseDto<T> {
    @IsOptional()
    @IsString()
    title?: string

    @IsOptional()
    @IsString()
    message?: string

    @IsOptional()
    data?: T

    @IsNumber()
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
