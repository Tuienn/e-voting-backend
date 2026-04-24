import { Inject, Injectable } from '@nestjs/common'
import { ClientProxy } from '@nestjs/microservices'
import { UserModule } from './app.module'

@Injectable()
export class AppService {
    constructor(@Inject(`TCP_${UserModule.CONFIGURATION.SERVICE_NAME}`) private readonly userClient: ClientProxy) {}
}
