import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { ConfigModule } from '@nestjs/config'
import CONFIGURATION, { TConfiguration } from '../configuration'
import { HttpLoggerMiddleware } from '@libs/middlewares/logger.middleware'

@Module({
    imports: [ConfigModule.forRoot({ load: [() => CONFIGURATION] })],
    controllers: [AppController],
    providers: [AppService]
})
export class AppModule implements NestModule {
    static CONFIGURATION: TConfiguration = CONFIGURATION

    configure(consumer: MiddlewareConsumer) {
        consumer
            .apply(HttpLoggerMiddleware)
            // Áp dụng cho route gốc và tất cả sub-route
            .forRoutes({ path: '', method: RequestMethod.ALL }, { path: '*path', method: RequestMethod.ALL })

        // Hoặc exclude một số route nhạy cảm nếu cần:
        // .exclude({ path: 'health', method: RequestMethod.GET })
        // .forRoutes('*');
    }
}
