import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { APP_INTERCEPTOR } from '@nestjs/core'
import { ExceptionInterceptor } from '@libs/interceptors/exception.interceptor'
import { TimeoutInterceptor } from '@libs/interceptors/timeout.interceptor'
import { TcpLoggerInterceptor } from '@libs/interceptors/tcp-logger.interceptor'
import { CacheModule } from '@nestjs/cache-manager'
import KeyvRedis, { Keyv } from '@keyv/redis'
import { KeyvCacheableMemory } from 'cacheable'
import { CONFIGURATION } from '../configuration'
import { UserModule } from './user/app.module'
import { AuthModule } from './auth/app.module'
import { TcpClientModule } from '../infrastructure/tcp-client.module'
import { PrismaModule } from '../infrastructure/prisma.module'

@Module({
    imports: [
        ConfigModule.forRoot({ load: [() => CONFIGURATION] }),
        TcpClientModule,
        CacheModule.register({
            isGlobal: true,
            import: [ConfigModule],
            inject: [ConfigService],
            useFactory: () => ({
                ttl: CONFIGURATION.IDENTITY_CONFIG.REDIS_CACHE_TTL,
                stores: [
                    new Keyv({
                        store: new KeyvCacheableMemory({
                            ttl: CONFIGURATION.IDENTITY_CONFIG.REDIS_CACHE_TTL,
                            lruSize: 5000
                        })
                    }),
                    new KeyvRedis(
                        `redis://:${CONFIGURATION.IDENTITY_CONFIG.REDIS_PASSWORD}@${CONFIGURATION.IDENTITY_CONFIG.REDIS_HOST}:${CONFIGURATION.IDENTITY_CONFIG.REDIS_PORT}`
                    )
                ]
            })
        }),
        PrismaModule,
        UserModule,
        AuthModule
    ],
    providers: [
        {
            provide: APP_INTERCEPTOR,
            useClass: TcpLoggerInterceptor
        },
        {
            provide: APP_INTERCEPTOR,
            useClass: ExceptionInterceptor
        },
        {
            provide: APP_INTERCEPTOR,
            useClass: TimeoutInterceptor
        }
    ]
})
export class AppModule {}
