import { BaseEnvConfiguration } from '@libs/configuration/base-env.config'
import { SocketEnvConfiguration } from '@libs/configuration/socket-env.config'
import { ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'

class Configuration extends BaseEnvConfiguration {
    @ValidateNested()
    @Type(() => SocketEnvConfiguration)
    // Validate trong các obj con
    SOCKET_CONFIG = new SocketEnvConfiguration()
}

export const CONFIGURATION = new Configuration()

// Đệ quy validate BaseEnvConfiguration và SocketEnvConfiguration
CONFIGURATION.validate()
