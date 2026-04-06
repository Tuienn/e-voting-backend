import { Logger, ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app/app.module'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { MicroserviceOptions, Transport } from '@nestjs/microservices'

async function bootstrap() {
    const app = await NestFactory.create(AppModule)

    //NOTE - Không sử dụng hàm NestFactory.createMicroservice vì muốn chạy cả HTTP server và TCP microservice trong cùng một ứng dụng NestJS, thay vì tách ra thành hai ứng dụng riêng biệt.
    app.connectMicroservice<MicroserviceOptions>({
        transport: Transport.TCP,
        options: {
            host: AppModule.CONFIGURATION.BFF_CONFIG.TCP_HOST,
            port: AppModule.CONFIGURATION.BFF_CONFIG.TCP_PORT
        }
    })

    const globalPrefix = AppModule.CONFIGURATION.GLOBAL_PREFIX
    app.setGlobalPrefix(globalPrefix)
    app.useGlobalPipes(new ValidationPipe({ transform: true }))

    //NOTE - Khởi động microservices server để nhận TCP request.
    app.startAllMicroservices()
    Logger.log(
        `🚀 TCP microservice is running on: ${AppModule.CONFIGURATION.BFF_CONFIG.TCP_HOST}:${AppModule.CONFIGURATION.BFF_CONFIG.TCP_PORT} `
    )

    const port = AppModule.CONFIGURATION.HTTP_PORT
    await app.listen(port)

    const swaggerConfig = new DocumentBuilder()
        .setTitle('BFF API')
        .setDescription('BFF API documentation')
        .setVersion('1.0')
        .addTag('bff')
        .addBearerAuth({
            type: 'http',
            in: 'header',
            name: 'Authorization',
            scheme: 'bearer',
            bearerFormat: 'JWT'
        })
        .build()

    const document = SwaggerModule.createDocument(app, swaggerConfig)
    SwaggerModule.setup(`${globalPrefix}/docs`, app, document)

    Logger.log(`🚀 Application is running on: http://localhost:${port}/${globalPrefix} `)
    Logger.log(`🚀 Swagger documentation is running on: http://localhost:${port}/${globalPrefix}/docs `)
}

bootstrap()
