import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { APP_INTERCEPTOR } from '@nestjs/core'
import { ExceptionInterceptor } from '@libs/interceptors/exception.interceptor'
import { HttpToRpcExceptionInterceptor } from '@libs/interceptors/http-to-rpc-exception.interceptor'
import { TimeoutInterceptor } from '@libs/interceptors/timeout.interceptor'
import { TcpLoggerInterceptor } from '@libs/interceptors/tcp-logger.interceptor'
import { CONFIGURATION } from '../configuration'
import { UserModule } from './user/app.module'
import { AuthModule } from './auth/app.module'
import { TcpClientModule } from '@libs/modules/tcp-client.module'
import { RedisCacheModule } from '@libs/modules/redis-cache.module'
import { PrismaModule } from '../infrastructure/prisma/prisma.module'

@Module({
    imports: [
        ConfigModule.forRoot({ load: [() => CONFIGURATION] }),
        TcpClientModule.register([
            {
                serviceName: CONFIGURATION.SERVICE_NAME,
                host: CONFIGURATION.IDENTITY_CONFIG.ELECTION_TCP_HOST,
                port: CONFIGURATION.IDENTITY_CONFIG.ELECTION_TCP_PORT
            }
        ]),
        RedisCacheModule.register({
            ttl: CONFIGURATION.IDENTITY_CONFIG.REDIS_CACHE_TTL,
            host: CONFIGURATION.IDENTITY_CONFIG.REDIS_HOST,
            port: CONFIGURATION.IDENTITY_CONFIG.REDIS_PORT,
            password: CONFIGURATION.IDENTITY_CONFIG.REDIS_PASSWORD
        }),
        PrismaModule,
        UserModule,
        AuthModule
    ],
    providers: [
        {
            provide: APP_INTERCEPTOR,
            useClass: HttpToRpcExceptionInterceptor
        },
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
