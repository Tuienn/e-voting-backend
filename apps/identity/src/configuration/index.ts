import { BaseEnvConfiguration } from '@libs/configuration/base-env.config'
import { IdentityEnvConfiguration } from '@libs/configuration/identity-env.config'
import { ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'

class Configuration extends BaseEnvConfiguration {
    @ValidateNested()
    @Type(() => IdentityEnvConfiguration)
    // Validate trong các obj con
    IDENTITY_CONFIG = new IdentityEnvConfiguration()
}

export const CONFIGURATION = new Configuration()

// Đệ quy validate BaseEnvConfiguration và IdentityEnvConfiguration
CONFIGURATION.validate()

export type TConfiguration = typeof CONFIGURATION
