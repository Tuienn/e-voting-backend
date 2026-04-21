import { IsNotEmpty, IsNumber, IsString } from 'class-validator'

export class UserEnvConfiguration {
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
    USER_TCP_HOST: string

    @IsNumber()
    USER_TCP_PORT: number

    constructor() {
        this.HTTP_PORT = Number(process.env['HTTP_PORT']) || 3000
        this.HTTP_GLOBAL_PREFIX = process.env['HTTP_GLOBAL_PREFIX'] || 'api/v1'
        this.TCP_HOST = process.env['TCP_HOST'] || 'localhost'
        this.TCP_PORT = Number(process.env['TCP_PORT']) || 3001
        this.USER_TCP_HOST = process.env['USER_TCP_HOST'] || 'localhost'
        this.USER_TCP_PORT = Number(process.env['USER_TCP_PORT']) || 3002
    }
}
