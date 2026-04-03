import { Module } from '@nestjs/common'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { ConfigModule } from '@nestjs/config'
import { CONFIGURATION, TConfiguration } from '../configuration'
import { APP_INTERCEPTOR } from '@nestjs/core'
import { HttpLoggerInterceptor } from '@libs/interceptors/logger.interceptor'
import { ExceptionInterceptor } from '@libs/interceptors/exception.interceptor'
import { TimeoutInterceptor } from '@libs/interceptors/timeout.interceptor'

@Module({
    imports: [ConfigModule.forRoot({ load: [() => CONFIGURATION] })],
    controllers: [AppController],
    providers: [
        AppService,
        {
            provide: APP_INTERCEPTOR,
            useClass: HttpLoggerInterceptor
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
export class AppModule {
    static CONFIGURATION: TConfiguration = CONFIGURATION
}
