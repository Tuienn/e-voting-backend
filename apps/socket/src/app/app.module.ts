import { HttpLoggerInterceptor } from '@libs/interceptors/http-logger.interceptor'
import { Module } from '@nestjs/common'
import { AppController } from './app.controller'
import { EventsGateway } from './events.gateway'
import { ConfigModule } from '@nestjs/config'
import { CONFIGURATION } from '../configuration'
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core'
import { ExceptionFilterHandler } from '@libs/filters/exception.filter'

@Module({
    imports: [ConfigModule.forRoot({ load: [() => CONFIGURATION] })],
    controllers: [AppController],
    providers: [
        EventsGateway,
        {
            provide: APP_INTERCEPTOR,
            useClass: HttpLoggerInterceptor
        },
        {
            provide: APP_FILTER,
            useClass: ExceptionFilterHandler
        }
    ]
})
export class AppModule {}
