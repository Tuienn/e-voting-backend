import { DynamicModule, Global, Module } from '@nestjs/common'
import { ClientsModule, Transport } from '@nestjs/microservices'

export type TcpClientConfig = {
    serviceName: string
    host: string
    port: number
}

@Global()
@Module({})
export class TcpClientModule {
    static register(configs: TcpClientConfig[]): DynamicModule {
        return {
            module: TcpClientModule,
            imports: [
                ClientsModule.register(
                    configs.map((config) => ({
                        name: `TCP_${config.serviceName}`,
                        transport: Transport.TCP,
                        options: {
                            host: config.host,
                            port: config.port
                        }
                    }))
                )
            ],
            exports: [ClientsModule]
        }
    }
}
