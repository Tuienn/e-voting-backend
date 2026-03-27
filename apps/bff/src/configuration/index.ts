import BaseConfiguration from '@libs/configuration/base.config'
import BffConfiguration from '@libs/configuration/bff.config'
import { ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'
class Configuration extends BaseConfiguration {
    @ValidateNested()
    @Type(() => BffConfiguration)
    // Validate trong các obj con
    BFF_CONFIG = new BffConfiguration()
}

const CONFIGURATION = new Configuration()

// Đệ quy validate BaseConfiguration và BffConfiguration
CONFIGURATION.validate()

export default CONFIGURATION
export type TConfiguration = typeof CONFIGURATION
