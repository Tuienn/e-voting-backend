import { Global, Module } from '@nestjs/common'
import { ClientsModule, Transport } from '@nestjs/microservices'
import { CONFIGURATION } from '../configuration'

@Global()
@Module({
    imports: [
        //NOTE- Tên định danh client TCP gọi và cấu hình options cho TCP service đích gọi đến
        ClientsModule.register([
            {
                name: `TCP_${CONFIGURATION.SERVICE_NAME}`,
                transport: Transport.TCP,
                options: {
                    host: CONFIGURATION.BFF_CONFIG.IDENTITY_TCP_HOST,
                    port: CONFIGURATION.BFF_CONFIG.IDENTITY_TCP_PORT
                }
            }
        ])
    ],
    exports: [ClientsModule]
})
export class TcpClientModule {}
