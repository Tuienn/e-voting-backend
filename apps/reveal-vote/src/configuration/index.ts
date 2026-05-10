import { BaseEnvConfiguration } from '@libs/configuration/base-env.config'
import { RevealVoteEnvConfiguration } from '@libs/configuration/reveal-vote-env.config'
import { ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'

class Configuration extends BaseEnvConfiguration {
    @ValidateNested()
    @Type(() => RevealVoteEnvConfiguration)
    // Validate trong các obj con
    REVEAL_VOTE_CONFIG = new RevealVoteEnvConfiguration()
}

export const CONFIGURATION = new Configuration()

// Đệ quy validate BaseEnvConfiguration và RevealVoteEnvConfiguration
CONFIGURATION.validate()
