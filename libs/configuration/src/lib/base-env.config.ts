import { Logger } from '@nestjs/common'
import { IsNotEmpty, IsNumber, IsString, Min, validateSync } from 'class-validator'

export class BaseEnvConfiguration {
    @IsString()
    NODE_ENV: string

    IS_DEV: boolean

    @IsString()
    @IsNotEmpty()
    SERVICE_NAME: string

    /**
     * Thời gian cửa sổ rate limit tính bằng milliseconds.
     * Ví dụ: 60000 = 1 phút
     * @default 60000
     */
    @IsNumber()
    @Min(1000)
    THROTTLE_TTL: number

    /**
     * Số request tối đa được phép trong mỗi cửa sổ THROTTLE_TTL.
     * @default 100
     */
    @IsNumber()
    @Min(1)
    THROTTLE_LIMIT: number

    constructor() {
        // Phần kiểm tra bên trên bằng class-validator có thể không cần dùng vì đang phần đã có giá trị mặc định, nhưng vẫn giữ để đảm bảo tính toàn vẹn của cấu hình
        this.NODE_ENV = process.env['NODE_ENV'] || 'development'
        this.IS_DEV = this.NODE_ENV === 'development'
        this.SERVICE_NAME = process.env['SERVICE_NAME'] || 'einvoice'
        this.THROTTLE_TTL = Number(process.env['THROTTLE_TTL']) || 60000
        this.THROTTLE_LIMIT = Number(process.env['THROTTLE_LIMIT']) || 100
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
