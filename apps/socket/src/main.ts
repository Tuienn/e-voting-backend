import { Logger } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app/app.module'
import { MicroserviceOptions, Transport } from '@nestjs/microservices'
import { CONFIGURATION } from './configuration'

async function bootstrap() {
    const app = await NestFactory.create(AppModule)

    //NOTE - Cấu hình CORS cho HTTP (Socket.IO handshake dùng CORS riêng trong gateway)
    app.enableCors({
        origin: CONFIGURATION.SOCKET_CONFIG.CORS_ORIGINS.split(','),
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
        credentials: true, // Cho phép gửi cookies/auth headers
        maxAge: 3600 // Cache preflight 1 giờ
    })

    //NOTE - Chạy chung HTTP server (Socket.IO) và Redis microservice consumer trong cùng 1 ứng dụng NestJS
    app.connectMicroservice<MicroserviceOptions>(
        {
            transport: Transport.REDIS,
            options: {
                host: CONFIGURATION.SOCKET_CONFIG.REDIS_HOST,
                port: CONFIGURATION.SOCKET_CONFIG.REDIS_PORT,
                password: CONFIGURATION.SOCKET_CONFIG.REDIS_PASSWORD
            }
        },
        { inheritAppConfig: true } //NOTE - Kế thừa cấu hình từ app server để interceptor/filter chạy cả khi nhận event Redis
    )

    app.enableShutdownHooks() //NOTE - Kích hoạt lifecycle hook onModuleDestroy để đóng kết nối Redis client khi ứng dụng tắt

    //NOTE - Khởi động microservices server để nhận event Redis Pub/Sub.
    await app.startAllMicroservices()

    const port = CONFIGURATION.SOCKET_CONFIG.HTTP_PORT
    await app.listen(port)

    Logger.log(`🚀 Socket.IO server is running on: http://localhost:${port}`, 'Bootstrap')
    Logger.log(
        `🚀 Redis event consumer is running on: ${CONFIGURATION.SOCKET_CONFIG.REDIS_HOST}:${CONFIGURATION.SOCKET_CONFIG.REDIS_PORT}`,
        'Bootstrap'
    )
}
bootstrap()
