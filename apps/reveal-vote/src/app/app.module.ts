import { TcpClientModule } from '@libs/modules/tcp-client.module'
import { CustomValidationPipe } from '@libs/pipes/custom-validation.pipe'
import { Module } from '@nestjs/common'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { ConfigModule } from '@nestjs/config'
import { CONFIGURATION } from '../configuration'
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core'
import { HttpLoggerInterceptor } from '@libs/interceptors/http-logger.interceptor'
import { ExceptionFilterHandler } from '@libs/filters/exception.filter'
import { TimeoutInterceptor } from '@libs/interceptors/timeout.interceptor'
import { HttpThrottlerGuard } from '@libs/guards/throttler.guard'
import { ThrottlerModule } from '@nestjs/throttler'
import { PrismaModule } from '../infrastructure/prisma/prisma.module'

@Module({
    imports: [
        ConfigModule.forRoot({ load: [() => CONFIGURATION] }),
        //NOTE - Giới hạn số request HTTP trong khoảng thời gian THROTTLE_TTL (ms), bỏ qua TCP
        ThrottlerModule.forRoot([
            {
                ttl: CONFIGURATION.REVEAL_VOTE_CONFIG.THROTTLE_TTL,
                limit: CONFIGURATION.REVEAL_VOTE_CONFIG.THROTTLE_LIMIT
            }
        ]),
        TcpClientModule.register([
            {
                serviceName: CONFIGURATION.REVEAL_VOTE_CONFIG.COORDINATOR_TCP_NAME,
                host: CONFIGURATION.REVEAL_VOTE_CONFIG.COORDINATOR_TCP_HOST,
                port: CONFIGURATION.REVEAL_VOTE_CONFIG.COORDINATOR_TCP_PORT
            }
        ]),
        PrismaModule
    ],
    controllers: [AppController],
    providers: [
        AppService,
        {
            provide: APP_GUARD,
            useClass: HttpThrottlerGuard
        },
        {
            provide: APP_INTERCEPTOR,
            useClass: HttpLoggerInterceptor
        },
        {
            provide: APP_FILTER,
            useClass: ExceptionFilterHandler
        },
        {
            provide: APP_INTERCEPTOR,
            useClass: TimeoutInterceptor
        },
        {
            provide: APP_PIPE,
            useClass: CustomValidationPipe
        }
    ]
})
export class AppModule {}
