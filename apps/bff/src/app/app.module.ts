import { AuthorizationGuard } from '../infrastructure/auth/authorization.guard'
import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { CONFIGURATION } from '../configuration'
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core'
import { HttpLoggerInterceptor } from '@libs/interceptors/http-logger.interceptor'
import { ExceptionInterceptor } from '@libs/interceptors/exception.interceptor'
import { TimeoutInterceptor } from '@libs/interceptors/timeout.interceptor'
import { HttpThrottlerGuard } from '@libs/guards/throttler.guard'
import { ThrottlerModule } from '@nestjs/throttler'
import { IdentityModule } from './identity/app.module'
import { TcpClientModule } from '@libs/modules/tcp-client.module'
import { AuthenticatorGuard } from '../infrastructure/auth/authenticator.guard'
import { JwtModule } from '@nestjs/jwt'

@Module({
    imports: [
        ConfigModule.forRoot({ load: [() => CONFIGURATION] }),
        //NOTE- Giới hạn số request HTTP trong khoảng thời gian THROTTLE_TTL (ms), bỏ qua TCP
        ThrottlerModule.forRoot([
            {
                ttl: CONFIGURATION.BFF_CONFIG.THROTTLE_TTL,
                limit: CONFIGURATION.BFF_CONFIG.THROTTLE_LIMIT
            }
        ]),
        //NOTE- Tên định danh client TCP gọi và cấu hình options cho TCP service đích gọi đến
        TcpClientModule.register([
            {
                serviceName: CONFIGURATION.SERVICE_NAME,
                host: CONFIGURATION.BFF_CONFIG.IDENTITY_TCP_HOST,
                port: CONFIGURATION.BFF_CONFIG.IDENTITY_TCP_PORT
            }
        ]),
        JwtModule.register({}),
        IdentityModule
    ],
    providers: [
        {
            provide: APP_GUARD,
            useClass: HttpThrottlerGuard
        },
        {
            provide: APP_INTERCEPTOR,
            useClass: TimeoutInterceptor
        },
        {
            provide: APP_INTERCEPTOR,
            useClass: HttpLoggerInterceptor
        },
        {
            provide: APP_INTERCEPTOR,
            useClass: ExceptionInterceptor
        },
        {
            provide: APP_GUARD,
            useClass: AuthenticatorGuard
        },
        {
            provide: APP_GUARD,
            useClass: AuthorizationGuard
        }
    ]
})
export class AppModule {}
