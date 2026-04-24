import { IsNumber, IsString } from 'class-validator'

export class IdentityEnvConfiguration {
    @IsString()
    TCP_HOST: string

    @IsNumber()
    TCP_PORT: number

    @IsString()
    ELECTION_TCP_HOST: string

    @IsNumber()
    ELECTION_TCP_PORT: number

    @IsString()
    DEFAULT_ADMIN_EMAIL: string

    @IsString()
    DEFAULT_ADMIN_PASSWORD: string

    @IsNumber()
    REDIS_CACHE_TTL: number

    @IsString()
    REDIS_HOST: string

    @IsNumber()
    REDIS_PORT: number

    @IsString()
    REDIS_PASSWORD: string

    @IsString()
    JWT_ACCESS_SECRET: string

    @IsNumber()
    JWT_ACCESS_EXPIRES_IN: number

    @IsString()
    JWT_REFRESH_SECRET: string

    @IsNumber()
    JWT_REFRESH_EXPIRES_IN: number

    constructor() {
        this.TCP_HOST = process.env['TCP_HOST'] || 'localhost'
        this.TCP_PORT = Number(process.env['TCP_PORT']) || 3302
        this.ELECTION_TCP_HOST = process.env['ELECTION_TCP_HOST'] || 'localhost'
        this.ELECTION_TCP_PORT = Number(process.env['ELECTION_TCP_PORT']) || 3303
        this.DEFAULT_ADMIN_EMAIL = process.env['DEFAULT_ADMIN_EMAIL'] || 'admin@example.com'
        this.DEFAULT_ADMIN_PASSWORD = process.env['DEFAULT_ADMIN_PASSWORD'] || '12345678'
        this.REDIS_CACHE_TTL = Number(process.env['REDIS_CACHE_TTL']) || 60000
        this.REDIS_HOST = process.env['REDIS_HOST'] || 'localhost'
        this.REDIS_PORT = Number(process.env['REDIS_PORT']) || 6379
        this.REDIS_PASSWORD = process.env['REDIS_PASSWORD'] || 'secret'
        this.JWT_ACCESS_SECRET = process.env['JWT_ACCESS_SECRET'] || 'default_access_secret'
        this.JWT_ACCESS_EXPIRES_IN = Number(process.env['JWT_ACCESS_EXPIRES_IN']) || 15 * 60
        this.JWT_REFRESH_SECRET = process.env['JWT_REFRESH_SECRET'] || 'default_refresh_secret'
        this.JWT_REFRESH_EXPIRES_IN = Number(process.env['JWT_REFRESH_EXPIRES_IN']) || 7 * 24 * 60 * 60
    }
}
