import { Inject, Injectable } from '@nestjs/common'
import { ClientProxy } from '@nestjs/microservices'
import { AuthModule } from './app.module'

@Injectable()
export class AppService {
    constructor(@Inject(`TCP_${AuthModule.CONFIGURATION.SERVICE_NAME}`) private readonly userClient: ClientProxy) {}
}
