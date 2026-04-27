import { CustomValidationPipe } from '@libs/pipes/custom-validation.pipe'
import { AuthorizationGuard } from '../infrastructure/auth/authorization.guard'
import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { CONFIGURATION } from '../configuration'
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core'
import { HttpLoggerInterceptor } from '@libs/interceptors/http-logger.interceptor'
import { TimeoutInterceptor } from '@libs/interceptors/timeout.interceptor'
import { RpcToHttpExceptionInterceptor } from '@libs/interceptors/rpc-to-http-exception.interceptor'
import { HttpThrottlerGuard } from '@libs/guards/throttler.guard'
import { ThrottlerModule } from '@nestjs/throttler'
import { IdentityModule } from './identity/app.module'
import { TcpClientModule } from '@libs/modules/tcp-client.module'
import { AuthenticatorGuard } from '../infrastructure/auth/authenticator.guard'
import { JwtModule } from '@nestjs/jwt'
import { ExceptionFilterHandler } from '@libs/filters/exception.filter'

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
            useClass: RpcToHttpExceptionInterceptor
        },
        {
            provide: APP_FILTER,
            useClass: ExceptionFilterHandler
        },
        {
            provide: APP_GUARD,
            useClass: AuthenticatorGuard
        },
        {
            provide: APP_GUARD,
            useClass: AuthorizationGuard
        },
        {
            provide: APP_PIPE,
            useClass: CustomValidationPipe
        }
    ]
})
export class AppModule {}
