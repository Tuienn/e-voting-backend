import { Inject, Injectable } from '@nestjs/common'
import { ClientProxy } from '@nestjs/microservices'
import { lastValueFrom } from 'rxjs'
import { CONFIGURATION } from '../configuration'
import { IDENTITY_MESSAGE_PATTERNS } from '@libs/constants/message-patterns.constant'
import { CreateVoterDto } from '@libs/types/user.dto'
import { httpExceptionFromMicroserviceClientError } from '@libs/utils/rpc-client-error.util'

@Injectable()
export class AppService {
    constructor(@Inject(`TCP_${CONFIGURATION.SERVICE_NAME}`) private readonly userClient: ClientProxy) {}

    async createVoter(data: CreateVoterDto) {
        try {
            return await lastValueFrom(this.userClient.send(IDENTITY_MESSAGE_PATTERNS.CREATE_VOTER, data))
        } catch (err) {
            throw httpExceptionFromMicroserviceClientError(err)
        }
    }
}
