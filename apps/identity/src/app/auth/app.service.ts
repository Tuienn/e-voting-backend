import { Inject, Injectable } from '@nestjs/common'
import { ClientProxy } from '@nestjs/microservices'
import { CONFIGURATION } from '../../configuration'

@Injectable()
export class AppService {
    constructor(@Inject(`TCP_${CONFIGURATION.SERVICE_NAME}`) private readonly userClient: ClientProxy) {}
}
