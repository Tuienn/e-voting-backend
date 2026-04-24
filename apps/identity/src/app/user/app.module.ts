import { Module } from '@nestjs/common'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { ConfigModule } from '@nestjs/config'
import { CONFIGURATION, TConfiguration } from '../../configuration'
import { ClientsModule, Transport } from '@nestjs/microservices'

@Module({
    imports: [
        ConfigModule.forRoot({ load: [() => CONFIGURATION] }),
        ClientsModule.register([
            {
                name: `TCP_${CONFIGURATION.SERVICE_NAME}`,
                transport: Transport.TCP,
                options: {
                    host: CONFIGURATION.IDENTITY_CONFIG.ELECTION_TCP_HOST,
                    port: CONFIGURATION.IDENTITY_CONFIG.ELECTION_TCP_PORT
                }
            }
        ])
    ],
    controllers: [AppController],
    providers: [AppService]
})
export class UserModule {
    static CONFIGURATION: TConfiguration = CONFIGURATION
}
