import { IsNumber, IsString } from 'class-validator'

export class SocketEnvConfiguration {
    @IsNumber()
    HTTP_PORT: number

    @IsString()
    REDIS_HOST: string

    @IsNumber()
    REDIS_PORT: number

    @IsString()
    REDIS_PASSWORD: string

    @IsString()
    CORS_ORIGINS: string

    constructor() {
        this.HTTP_PORT = Number(process.env['HTTP_PORT']) || 3008

        this.REDIS_HOST = process.env['REDIS_HOST'] || 'localhost'
        this.REDIS_PORT = Number(process.env['REDIS_PORT']) || 6379
        this.REDIS_PASSWORD = process.env['REDIS_PASSWORD'] || 'secret'

        this.CORS_ORIGINS =
            process.env['CORS_ORIGINS'] || 'http://localhost:5173,http://localhost:3000,http://localhost:8081'
    }
}
