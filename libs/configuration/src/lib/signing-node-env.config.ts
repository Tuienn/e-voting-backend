import { IsNumber, IsString } from 'class-validator'

export class SigningNodeEnvConfiguration {
    @IsString()
    TCP_HOST: string

    @IsNumber()
    TCP_PORT: number

    @IsString()
    NODE_ID: string

    @IsNumber()
    REDIS_CACHE_TTL: number

    @IsString()
    REDIS_HOST: string

    @IsNumber()
    REDIS_PORT: number

    @IsString()
    REDIS_PASSWORD: string

    constructor() {
        this.TCP_HOST = process.env['TCP_HOST'] || 'localhost'
        this.TCP_PORT = Number(process.env['TCP_PORT']) || 3304
        this.NODE_ID = process.env['NODE_ID'] || 'SIGNING_NODE_1'
        this.REDIS_CACHE_TTL = Number(process.env['REDIS_CACHE_TTL']) || 60000
        this.REDIS_HOST = process.env['REDIS_HOST'] || 'localhost'
        this.REDIS_PORT = Number(process.env['REDIS_PORT']) || 6379
        this.REDIS_PASSWORD = process.env['REDIS_PASSWORD'] || 'secret'
    }
}
