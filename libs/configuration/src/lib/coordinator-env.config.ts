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
    REDIS_SESSION_CACHE_TTL: number

    @IsNumber()
    REDIS_VOTE_COUNT_CACHE_TTL: number

    @IsString()
    RECONCILER_CRON_EXPRESSION: string

    @IsNumber()
    RECONCILER_STALE_MS: number

    @IsString()
    REDIS_HOST: string

    @IsNumber()
    REDIS_PORT: number

    @IsString()
    REDIS_PASSWORD: string

    @IsString()
    FABRIC_HOST: string

    @IsString()
    FABRIC_USERNAME: string

    @IsString()
    FABRIC_PASSWORD: string

    @IsString()
    FABRIC_CHAINCODE_ID: string

    @IsString()
    FABRIC_CHANNEL_NAME: string

    @IsString()
    FABRIC_ORG_ID: string

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

        this.REDIS_VOTE_COUNT_CACHE_TTL = Number(process.env['REDIS_VOTE_COUNT_CACHE_TTL']) || 604800000 // 7 days
        // Reconciler đồng bộ các record kẹt PENDING_CHAIN / CLOSING với chain
        this.RECONCILER_CRON_EXPRESSION = process.env['RECONCILER_CRON_EXPRESSION'] || '*/1 * * * *' // chạy mỗi phút
        this.RECONCILER_STALE_MS = Number(process.env['RECONCILER_STALE_MS']) || 120000 // chỉ động vào record cũ hơn 120s (tránh đụng request đang chạy)
        this.REDIS_HOST = process.env['REDIS_HOST'] || 'localhost'
        this.REDIS_PORT = Number(process.env['REDIS_PORT']) || 6379
        this.REDIS_PASSWORD = process.env['REDIS_PASSWORD'] || 'secret'
        this.REDIS_SESSION_CACHE_TTL = Number(process.env['REDIS_SESSION_CACHE_TTL']) || 120000

        this.FABRIC_HOST = process.env['FABRIC_HOST'] || 'http://localhost:8100/api/v1'
        this.FABRIC_USERNAME = process.env['FABRIC_USERNAME'] || 'fabric-client'
        this.FABRIC_PASSWORD = process.env['FABRIC_PASSWORD'] || 'fabric-password'
        this.FABRIC_CHAINCODE_ID = process.env['FABRIC_CHAINCODE_ID'] || '2'
        this.FABRIC_CHANNEL_NAME = process.env['FABRIC_CHANNEL_NAME'] || 'votechannel'
        this.FABRIC_ORG_ID = process.env['FABRIC_ORG_ID'] || '1'
    }
}
