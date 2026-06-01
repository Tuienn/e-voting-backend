import { DynamicModule, Global, Module } from '@nestjs/common'
import { ClientsModule, Transport } from '@nestjs/microservices'
import { getClientTlsOptions } from '@libs/configuration/mtls.config'

export type TcpClientConfig = {
    serviceName: string
    host: string
    port: number
    tlsServerName?: string //NOTE - tên trong SAN của server cần verify (chỉ cần khi host khác SAN, vd host là IP)
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
                            port: config.port,
                            tlsOptions: getClientTlsOptions(config.tlsServerName ?? config.host) //NOTE - mTLS client, undefined khi tắt
                        }
                    }))
                )
            ],
            exports: [ClientsModule]
        }
    }
}
