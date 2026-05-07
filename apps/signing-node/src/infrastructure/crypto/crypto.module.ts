import { RedisCacheModule } from '@libs/modules/redis-cache.module'
import { Global, Module } from '@nestjs/common'
import { CryptoService } from './crypto.service'
import { CONFIGURATION } from '../../configuration'

@Global()
@Module({
    imports: [
        RedisCacheModule.register({
            ttl: CONFIGURATION.SIGNING_NODE_CONFIG.REDIS_CACHE_TTL,
            host: CONFIGURATION.SIGNING_NODE_CONFIG.REDIS_HOST,
            port: CONFIGURATION.SIGNING_NODE_CONFIG.REDIS_PORT,
            password: CONFIGURATION.SIGNING_NODE_CONFIG.REDIS_PASSWORD
        })
    ],
    providers: [CryptoService],
    exports: [CryptoService]
})
export class CryptoModule {}
