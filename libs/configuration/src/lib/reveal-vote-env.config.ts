import { IsNotEmpty, IsNumber, IsString, Min } from 'class-validator'

export class RevealVoteEnvConfiguration {
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
    CORS_ORIGINS: string

    @IsNumber()
    @Min(1000)
    THROTTLE_TTL: number

    @IsNumber()
    @Min(1)
    THROTTLE_LIMIT: number

    @IsString()
    COORDINATOR_TCP_NAME: string

    @IsString()
    COORDINATOR_TCP_HOST: string

    @IsNumber()
    COORDINATOR_TCP_PORT: number

    @IsString()
    IDENTITY_TCP_NAME: string

    @IsString()
    IDENTITY_TCP_HOST: string

    @IsNumber()
    IDENTITY_TCP_PORT: number

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
        this.HTTP_PORT = Number(process.env['HTTP_PORT']) || 3007
        this.HTTP_GLOBAL_PREFIX = process.env['HTTP_GLOBAL_PREFIX'] || 'api/v1'
        this.TCP_HOST = process.env['TCP_HOST'] || 'localhost'
        this.TCP_PORT = Number(process.env['TCP_PORT']) || 3007

        this.CORS_ORIGINS = process.env['CORS_ORIGINS'] || 'http://localhost:5173,http://localhost:3000'
        this.THROTTLE_TTL = Number(process.env['THROTTLE_TTL']) || 60000
        this.THROTTLE_LIMIT = Number(process.env['THROTTLE_LIMIT']) || 100

        this.COORDINATOR_TCP_NAME = process.env['COORDINATOR_TCP_NAME'] || 'COORDINATOR'
        this.COORDINATOR_TCP_HOST = process.env['COORDINATOR_TCP_HOST'] || 'localhost'
        this.COORDINATOR_TCP_PORT = Number(process.env['COORDINATOR_TCP_PORT']) || 3303

        this.IDENTITY_TCP_NAME = process.env['IDENTITY_TCP_NAME'] || 'IDENTITY'
        this.IDENTITY_TCP_HOST = process.env['IDENTITY_TCP_HOST'] || 'localhost'
        this.IDENTITY_TCP_PORT = Number(process.env['IDENTITY_TCP_PORT']) || 3302

        this.REDIS_HOST = process.env['REDIS_HOST'] || 'localhost'
        this.REDIS_PORT = Number(process.env['REDIS_PORT']) || 6379
        this.REDIS_PASSWORD = process.env['REDIS_PASSWORD'] || 'secret'

        this.FABRIC_HOST = process.env['FABRIC_HOST'] || 'http://localhost:8100/api/v1'
        this.FABRIC_USERNAME = process.env['FABRIC_USERNAME'] || 'fabric-client'
        this.FABRIC_PASSWORD = process.env['FABRIC_PASSWORD'] || 'fabric-password'
        this.FABRIC_CHAINCODE_ID = process.env['FABRIC_CHAINCODE_ID'] || '2'
        this.FABRIC_CHANNEL_NAME = process.env['FABRIC_CHANNEL_NAME'] || 'votechannel'
        this.FABRIC_ORG_ID = process.env['FABRIC_ORG_ID'] || '1'
    }
}
