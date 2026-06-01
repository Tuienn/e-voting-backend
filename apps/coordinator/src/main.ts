import { Logger } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app/app.module'
import { MicroserviceOptions, Transport } from '@nestjs/microservices'
import { CONFIGURATION } from './configuration'
import { getServerTlsOptions } from '@libs/configuration/mtls.config'

async function bootstrap() {
    const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
        transport: Transport.TCP,
        options: {
            host: CONFIGURATION.COORDINATOR_CONFIG.TCP_HOST,
            port: CONFIGURATION.COORDINATOR_CONFIG.TCP_PORT,
            tlsOptions: getServerTlsOptions() //NOTE - mTLS: bật khi MTLS_ENABLED=true, undefined => TCP thường (dev)
        }
    })

    app.enableShutdownHooks() //NOTE - Kích hoạt lifecycle hook onModuleDestroy để có thể đóng kết nối TCP client khi ứng dụng tắt

    await app.listen()

    Logger.log(
        `🚀 TCP microservice is running on: ${CONFIGURATION.COORDINATOR_CONFIG.TCP_HOST}:${CONFIGURATION.COORDINATOR_CONFIG.TCP_PORT}`,
        'Bootstrap'
    )
}
bootstrap()
