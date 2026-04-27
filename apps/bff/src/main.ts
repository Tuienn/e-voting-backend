import { Logger } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app/app.module'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { MicroserviceOptions, Transport } from '@nestjs/microservices'
import helmet from 'helmet'
import { getHelmetConfig } from '@libs/configuration/helmet.config'
import { CONFIGURATION } from './configuration'

async function bootstrap() {
    const app = await NestFactory.create(AppModule)

    //NOTE - Cấu hình CORS
    app.enableCors({
        origin: CONFIGURATION.BFF_CONFIG.CORS_ORIGINS.split(','),
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
        credentials: true, // Cho phép gửi cookies/auth headers
        maxAge: 3600 // Cache preflight 1 giờ
    })

    app.use(helmet(getHelmetConfig(!CONFIGURATION.IS_DEV)))

    //NOTE - Không sử dụng hàm NestFactory.createMicroservice vì muốn chạy cả HTTP server và TCP microservice trong cùng một ứng dụng NestJS, thay vì tách ra thành hai ứng dụng riêng biệt.
    app.connectMicroservice<MicroserviceOptions>(
        {
            transport: Transport.TCP,
            options: {
                host: CONFIGURATION.BFF_CONFIG.TCP_HOST,
                port: CONFIGURATION.BFF_CONFIG.TCP_PORT
            }
        },
        { inheritAppConfig: true } //NOTE - Kế thừa cấu hình từ app server, nếu không có flag này, TcpLoggerInterceptor được đăng ký trong app.module.ts sẽ không bao giờ chạy khi nhận TCP message
    )

    const globalPrefix = CONFIGURATION.BFF_CONFIG.HTTP_GLOBAL_PREFIX
    app.setGlobalPrefix(globalPrefix)

    app.enableShutdownHooks() //NOTE - Kích hoạt lifecycle hook onModuleDestroy để có thể đóng kết nối TCP client khi ứng dụng tắt

    //NOTE - Khởi động microservices server để nhận TCP request.
    app.startAllMicroservices()
    Logger.log(
        `🚀 TCP microservice is running on: ${CONFIGURATION.BFF_CONFIG.TCP_HOST}:${CONFIGURATION.BFF_CONFIG.TCP_PORT}`,
        'Bootstrap'
    )

    const swaggerConfig = new DocumentBuilder()
        .setTitle('BFF API')
        .setDescription('BFF API documentation')
        .setVersion('1.0')
        .addBearerAuth(
            {
                type: 'http',
                scheme: 'bearer',
                bearerFormat: 'JWT',
                name: 'Authorization',
                description: 'Paste access token only. Swagger will add the Bearer prefix automatically.',
                in: 'header'
            },
            'access-token' // Tên scheme, dùng lại trong decorator
        )
        .addSecurityRequirements('access-token')
        .build()

    const document = SwaggerModule.createDocument(app, swaggerConfig)
    SwaggerModule.setup(`${globalPrefix}/docs`, app, document, {
        swaggerOptions: {
            persistAuthorization: true
        }
    })

    const port = CONFIGURATION.BFF_CONFIG.HTTP_PORT
    await app.listen(port)

    Logger.log(`🚀 Application is running on: http://localhost:${port}/${globalPrefix}`, 'Bootstrap')
    Logger.log(`🚀 Swagger documentation is running on: http://localhost:${port}/${globalPrefix}/docs`, 'Bootstrap')
}

bootstrap()
