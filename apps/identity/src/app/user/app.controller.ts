import { Controller } from '@nestjs/common'
import { AppService } from './app.service'
import { MessagePattern, Payload } from '@nestjs/microservices'
import { CreateVoterDto } from '@libs/types/identity/user.dto'
import { IDENTITY_MESSAGE_PATTERNS } from '@libs/constants/message-patterns.constant'
@Controller()
export class AppController {
    constructor(private readonly appService: AppService) {}

    @MessagePattern(IDENTITY_MESSAGE_PATTERNS.CREATE_VOTER)
    async createVoter(@Payload() data: CreateVoterDto) {
        return await this.appService.createVoter(data)
    }
}
