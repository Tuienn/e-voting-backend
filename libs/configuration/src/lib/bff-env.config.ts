import { IsNotEmpty, IsNumber, IsString, Min } from 'class-validator'

export class BffEnvConfiguration {
    @IsNumber()
    HTTP_PORT: number

    @IsString()
    @IsNotEmpty()
    HTTP_GLOBAL_PREFIX: string

    @IsString()
    TCP_HOST: string

    @IsNumber()
    TCP_PORT: number

    @IsString()
    IDENTITY_TCP_NAME: string

    @IsString()
    IDENTITY_TCP_HOST: string

    @IsNumber()
    IDENTITY_TCP_PORT: number

    @IsString()
    COORDINATOR_TCP_NAME: string

    @IsString()
    COORDINATOR_TCP_HOST: string

    @IsNumber()
    COORDINATOR_TCP_PORT: number

    @IsString()
    CORS_ORIGINS: string

    @IsString()
    ADMIN_WEB_ORIGIN: string

    @IsNumber()
    @Min(1000)
    THROTTLE_TTL: number

    @IsNumber()
    @Min(1)
    THROTTLE_LIMIT: number

    @IsString()
    JWT_ACCESS_SECRET: string

    @IsNumber()
    REDIS_CACHE_TTL: number

    @IsString()
    REDIS_HOST: string

    @IsNumber()
    REDIS_PORT: number

    @IsString()
    REDIS_PASSWORD: string

    constructor() {
        this.HTTP_PORT = Number(process.env['HTTP_PORT']) || 3000
        this.HTTP_GLOBAL_PREFIX = process.env['HTTP_GLOBAL_PREFIX'] || 'api/v1'
        this.TCP_HOST = process.env['TCP_HOST'] || 'localhost'
        this.TCP_PORT = Number(process.env['TCP_PORT']) || 3301

        this.IDENTITY_TCP_NAME = process.env['IDENTITY_TCP_NAME'] || 'IDENTITY'
        this.IDENTITY_TCP_HOST = process.env['IDENTITY_TCP_HOST'] || 'localhost'
        this.IDENTITY_TCP_PORT = Number(process.env['IDENTITY_TCP_PORT']) || 3302

        this.COORDINATOR_TCP_NAME = process.env['COORDINATOR_TCP_NAME'] || 'COORDINATOR'
        this.COORDINATOR_TCP_HOST = process.env['COORDINATOR_TCP_HOST'] || 'localhost'
        this.COORDINATOR_TCP_PORT = Number(process.env['COORDINATOR_TCP_PORT']) || 3303

        this.CORS_ORIGINS = process.env['CORS_ORIGINS'] || 'http://localhost:5173'
        this.ADMIN_WEB_ORIGIN = process.env['ADMIN_WEB_ORIGIN'] || 'http://localhost:5173'
        this.THROTTLE_TTL = Number(process.env['THROTTLE_TTL']) || 60000
        this.THROTTLE_LIMIT = Number(process.env['THROTTLE_LIMIT']) || 100
        this.JWT_ACCESS_SECRET = process.env['JWT_ACCESS_SECRET'] || 'default_access_secret'

        this.REDIS_CACHE_TTL = Number(process.env['REDIS_CACHE_TTL']) || 60000
        this.REDIS_HOST = process.env['REDIS_HOST'] || 'localhost'
        this.REDIS_PORT = Number(process.env['REDIS_PORT']) || 6379
        this.REDIS_PASSWORD = process.env['REDIS_PASSWORD'] || 'secret'
    }
}
