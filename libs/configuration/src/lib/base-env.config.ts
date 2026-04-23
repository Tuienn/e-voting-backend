import { Logger } from '@nestjs/common'
import { IsNotEmpty, IsString, validateSync } from 'class-validator'

export class BaseEnvConfiguration {
    @IsString()
    NODE_ENV: string

    IS_DEV: boolean

    @IsString()
    @IsNotEmpty()
    SERVICE_NAME: string

    constructor() {
        // Phần kiểm tra bên trên bằng class-validator có thể không cần dùng vì đang phần đã có giá trị mặc định, nhưng vẫn giữ để đảm bảo tính toàn vẹn của cấu hình
        this.NODE_ENV = process.env['NODE_ENV'] || 'development'
        this.IS_DEV = this.NODE_ENV === 'development'
        this.SERVICE_NAME = process.env['SERVICE_NAME'] || 'e-voting-backend'
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
