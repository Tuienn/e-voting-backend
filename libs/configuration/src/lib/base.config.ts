import { Logger } from '@nestjs/common'
import { IsNotEmpty, IsNumber, IsString, validateSync } from 'class-validator'

export class BaseConfiguration {
    @IsString()
    NODE_ENV: string

    IS_DEV: boolean

    @IsNumber()
    HTTP_PORT: number

    @IsString()
    @IsNotEmpty()
    GLOBAL_PREFIX: string

    constructor() {
        // Phần kiểm tra bên trên bằng class-validator có thể không cần dùng vì đang phần đã có giá trị mặc định, nhưng vẫn giữ để đảm bảo tính toàn vẹn của cấu hình
        this.NODE_ENV = process.env['NODE_ENV'] || 'development'
        this.IS_DEV = this.NODE_ENV === 'development'
        this.HTTP_PORT = Number(process.env['HTTP_PORT']) || 3000
        this.GLOBAL_PREFIX = process.env['GLOBAL_PREFIX'] || 'api/v1'
    }

    validate() {
        const errors = validateSync(this)
        if (errors.length > 0) {
            const errorMessages = errors.map((error) => Object.values(error.constraints || {}).join(', ')).join('; ')

            Logger.error(`Configuration validation failed: ${errorMessages}`)
            throw new Error(`Configuration validation failed: ${errorMessages}`)
        }
    }
}
