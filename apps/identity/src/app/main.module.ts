import { TcpCacheInterceptor } from '@libs/interceptors/tcp-cache.interceptor'
import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { APP_INTERCEPTOR } from '@nestjs/core'
import { ExceptionInterceptor } from '@libs/interceptors/exception.interceptor'
import { TimeoutInterceptor } from '@libs/interceptors/timeout.interceptor'
import { TcpLoggerInterceptor } from '@libs/interceptors/tcp-logger.interceptor'
import { ClientsModule, Transport } from '@nestjs/microservices'
import { CacheModule } from '@nestjs/cache-manager'
import KeyvRedis, { Keyv } from '@keyv/redis'
import { KeyvCacheableMemory } from 'cacheable'
import { CONFIGURATION, TConfiguration } from '../configuration'
import { PrismaService } from '../prisma/prisma.service'
import { SeedAdminService } from '../seed/seed-admin.service'
import { UserModule } from './user/app.module'
import { AuthModule } from './auth/app.module'

@Module({
    imports: [
        ConfigModule.forRoot({ load: [() => CONFIGURATION] }),
        //NOTE- Tên định danh client TCP gọi và cấu hình options cho TCP service đích gọi đến
        ClientsModule.register([
            {
                name: `TCP_${AppModule.CONFIGURATION.SERVICE_NAME}`,
                transport: Transport.TCP,
                options: {
                    host: AppModule.CONFIGURATION.IDENTITY_CONFIG.ELECTION_TCP_HOST,
                    port: AppModule.CONFIGURATION.IDENTITY_CONFIG.ELECTION_TCP_PORT
                }
            }
        ]),
        CacheModule.register({
            isGlobal: true,
            import: [ConfigModule],
            inject: [ConfigService],
            useFactory: () => ({
                ttl: AppModule.CONFIGURATION.IDENTITY_CONFIG.REDIS_CACHE_TTL,
                stores: [
                    new Keyv({
                        store: new KeyvCacheableMemory({
                            ttl: AppModule.CONFIGURATION.IDENTITY_CONFIG.REDIS_CACHE_TTL,
                            lruSize: 5000
                        })
                    }),
                    new KeyvRedis(
                        `redis://:${AppModule.CONFIGURATION.IDENTITY_CONFIG.REDIS_PASSWORD}@${AppModule.CONFIGURATION.IDENTITY_CONFIG.REDIS_HOST}:${AppModule.CONFIGURATION.IDENTITY_CONFIG.REDIS_PORT}`
                    )
                ]
            })
        }),
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
