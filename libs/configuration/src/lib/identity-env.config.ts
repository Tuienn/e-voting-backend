import { IsNotEmpty, IsNumber, IsString } from 'class-validator'

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
    @IsNotEmpty()
    DEFAULT_ADMIN_EMAIL: string

    @IsString()
    @IsNotEmpty()
    DEFAULT_ADMIN_PASSWORD: string

    @IsNumber()
    REDIS_CACHE_TTL: number

    @IsString()
    @IsNotEmpty()
    REDIS_HOST: string

    @IsNumber()
    REDIS_PORT: number

    @IsString()
    @IsNotEmpty()
    REDIS_PASSWORD: string

    constructor() {
        this.TCP_HOST = process.env['TCP_HOST'] || 'localhost'
        this.TCP_PORT = Number(process.env['TCP_PORT']) || 3301
        this.ELECTION_TCP_HOST = process.env['ELECTION_TCP_HOST'] || 'localhost'
        this.ELECTION_TCP_PORT = Number(process.env['ELECTION_TCP_PORT']) || 3303
        this.DEFAULT_ADMIN_EMAIL = process.env['DEFAULT_ADMIN_EMAIL'] || 'admin@example.com'
        this.DEFAULT_ADMIN_PASSWORD = process.env['DEFAULT_ADMIN_PASSWORD'] || '12345678'
        this.REDIS_CACHE_TTL = Number(process.env['REDIS_CACHE_TTL']) || 60000
        this.REDIS_HOST = process.env['REDIS_HOST'] || 'localhost'
        this.REDIS_PORT = Number(process.env['REDIS_PORT']) || 6379
        this.REDIS_PASSWORD = process.env['REDIS_PASSWORD'] || 'secret'
    }
}
