import { RedisCacheModule } from '@libs/modules/redis-cache.module'
import { Module } from '@nestjs/common'
import { ElectionModule } from '../election/app.module'
import { AppController } from './app.controller'
import { CONFIGURATION } from '../../configuration'
import { AppService } from './app.service'

@Module({
    imports: [
        ElectionModule,
        RedisCacheModule.register({
            ttl: CONFIGURATION.COORDINATOR_CONFIG.REDIS_CACHE_TTL,
            host: CONFIGURATION.COORDINATOR_CONFIG.REDIS_HOST,
            port: CONFIGURATION.COORDINATOR_CONFIG.REDIS_PORT,
            password: CONFIGURATION.COORDINATOR_CONFIG.REDIS_PASSWORD
        })
    ],
    controllers: [AppController],
    providers: [AppService]
})
export class VoteModule {}
