import { IsString } from 'class-validator'

export class BffConfiguration {
    @IsString()
    TEST_CONFIG: string

    constructor() {
        this.TEST_CONFIG = process.env['TEST_CONFIG'] || 'test config value'
    }
}
