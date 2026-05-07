import { IsArray, IsNumber, IsString } from 'class-validator'

export class CoordinatorEnvConfiguration {
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

    @IsArray()
    @IsString({ each: true })
    SIGNING_NODES_TCP_NAME: string[]

    @IsArray()
    @IsString({ each: true })
    SIGNING_NODES_TCP_HOST: string[]

    @IsArray()
    @IsNumber({}, { each: true })
    SIGNING_NODES_TCP_PORT: number[]

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
        this.TCP_PORT = Number(process.env['TCP_PORT']) || 3303

        this.IDENTITY_TCP_NAME = process.env['IDENTITY_TCP_NAME'] || 'IDENTITY'
        this.IDENTITY_TCP_HOST = process.env['IDENTITY_TCP_HOST'] || 'localhost'
        this.IDENTITY_TCP_PORT = Number(process.env['IDENTITY_TCP_PORT']) || 3302

        this.SIGNING_NODES_TCP_NAME = process.env['SIGNING_NODES_TCP_NAME']?.split(',') || [
            'SIGNING_NODE_1',
            'SIGNING_NODE_2',
            'SIGNING_NODE_3'
        ]

        this.SIGNING_NODES_TCP_HOST = process.env['SIGNING_NODES_TCP_HOST']?.split(',') || [
            'localhost',
            'localhost',
            'localhost'
        ]
        this.SIGNING_NODES_TCP_PORT = process.env['SIGNING_NODES_TCP_PORT']?.split(',').map(Number) || [
            3304, 3305, 3306
        ]

        this.REDIS_CACHE_TTL = Number(process.env['REDIS_CACHE_TTL']) || 30000
        this.REDIS_HOST = process.env['REDIS_HOST'] || 'localhost'
        this.REDIS_PORT = Number(process.env['REDIS_PORT']) || 6379
        this.REDIS_PASSWORD = process.env['REDIS_PASSWORD'] || 'secret'
    }
}
