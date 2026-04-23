import { TcpCacheInterceptor } from '@libs/interceptors/tcp-cache.interceptor'
import { Module } from '@nestjs/common'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { CONFIGURATION, TConfiguration } from '../configuration'
import { APP_INTERCEPTOR } from '@nestjs/core'
import { ExceptionInterceptor } from '@libs/interceptors/exception.interceptor'
import { TimeoutInterceptor } from '@libs/interceptors/timeout.interceptor'
import { TcpLoggerInterceptor } from '@libs/interceptors/tcp-logger.interceptor'
import { ClientsModule, Transport } from '@nestjs/microservices'
import { PrismaService } from '../prisma/prisma.service'
import { SeedAdminService } from '../seed/seed-admin.service'
import { CacheModule } from '@nestjs/cache-manager'
import KeyvRedis, { Keyv } from '@keyv/redis'
import { KeyvCacheableMemory } from 'cacheable'
@Module({
    imports: [
        ConfigModule.forRoot({ load: [() => CONFIGURATION] }),
        //NOTE- Tên định danh client TCP gọi và cấu hình options cho TCP service đích gọi đến
        ClientsModule.register([
            {
                name: `TCP_${AppModule.CONFIGURATION.SERVICE_NAME}`,
                transport: Transport.TCP,
                options: {
                    host: AppModule.CONFIGURATION.USER_CONFIG.ELECTION_TCP_HOST,
                    port: AppModule.CONFIGURATION.USER_CONFIG.ELECTION_TCP_PORT
                }
            }
        ]),
        CacheModule.register({
            isGlobal: true,
            import: [ConfigModule],
            inject: [ConfigService],
            useFactory: () => ({
                ttl: AppModule.CONFIGURATION.USER_CONFIG.REDIS_CACHE_TTL,
                stores: [
                    new Keyv({
                        store: new KeyvCacheableMemory({
                            ttl: AppModule.CONFIGURATION.USER_CONFIG.REDIS_CACHE_TTL,
                            lruSize: 5000
                        })
                    }),
                    new KeyvRedis(
                        `redis://:${AppModule.CONFIGURATION.USER_CONFIG.REDIS_PASSWORD}@${AppModule.CONFIGURATION.USER_CONFIG.REDIS_HOST}:${AppModule.CONFIGURATION.USER_CONFIG.REDIS_PORT}`
                    )
                ]
            })
        })
    ],
    controllers: [AppController],
    providers: [
        AppService,
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
        },
        PrismaService,
        SeedAdminService,
        {
            provide: APP_INTERCEPTOR,
            useClass: TcpCacheInterceptor
        }
    ]
})
export class AppModule {
    static CONFIGURATION: TConfiguration = CONFIGURATION
}
