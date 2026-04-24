import { BaseEnvConfiguration } from '@libs/configuration/base-env.config'
import { BffEnvConfiguration } from '@libs/configuration/bff-env.config'
import { ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'
class Configuration extends BaseEnvConfiguration {
    @ValidateNested()
    @Type(() => BffEnvConfiguration)
    // Validate trong các obj con
    BFF_CONFIG = new BffEnvConfiguration()
}

export const CONFIGURATION = new Configuration()

// Đệ quy validate BaseEnvConfiguration và BffEnvConfiguration
CONFIGURATION.validate()
