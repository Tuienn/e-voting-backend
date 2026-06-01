import { DynamicModule, Global, Module } from '@nestjs/common'
import { ClientsModule, Transport } from '@nestjs/microservices'
import { getRedisTlsOptions } from '@libs/configuration/mtls.config'

export type EventBusConfig = {
    host: string
    port: number
    password?: string
}

@Global()
@Module({})
export class EventBusModule {
    static register(config: EventBusConfig): DynamicModule {
        return {
            module: EventBusModule,
            imports: [
                //NOTE - Client Redis Pub/Sub dùng chung tên 'EVENT_BUS' để publish event realtime tới socket gateway
                ClientsModule.register([
                    {
                        name: 'EVENT_BUS',
                        transport: Transport.REDIS,
                        options: {
                            host: config.host,
                            port: config.port,
                            password: config.password,
                            tls: getRedisTlsOptions() //NOTE - mTLS Redis (ioredis), undefined khi tắt
                        }
                    }
                ])
            ],
            exports: [ClientsModule]
        }
    }
}
