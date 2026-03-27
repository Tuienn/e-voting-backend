import { IsString } from 'class-validator'

export default class BffConfiguration {
    @IsString()
    TEST_CONFIG: string

    constructor() {
        this.TEST_CONFIG = process.env['TEST_CONFIG'] || 'test config value'
    }
}
