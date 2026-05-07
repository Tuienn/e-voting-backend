import { CustomValidationPipe } from '@libs/pipes/custom-validation.pipe'
import { Module } from '@nestjs/common'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { ConfigModule } from '@nestjs/config'
import { CONFIGURATION } from '../configuration'
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core'
import { ExceptionFilterHandler } from '@libs/filters/exception.filter'
import { TimeoutInterceptor } from '@libs/interceptors/timeout.interceptor'
import { TcpLoggerInterceptor } from '@libs/interceptors/tcp-logger.interceptor'
import { HttpToRpcExceptionInterceptor } from '@libs/interceptors/http-to-rpc-exception.interceptor'
import { CryptoModule } from '../infrastructure/crypto/crypto.module'

@Module({
    imports: [ConfigModule.forRoot({ load: [() => CONFIGURATION] }), CryptoModule],
    controllers: [AppController],
    providers: [
        AppService,
        {
            provide: APP_INTERCEPTOR,
            useClass: HttpToRpcExceptionInterceptor
        },
        {
            provide: APP_INTERCEPTOR,
            useClass: TcpLoggerInterceptor
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
