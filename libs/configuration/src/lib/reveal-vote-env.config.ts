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
    }
}
