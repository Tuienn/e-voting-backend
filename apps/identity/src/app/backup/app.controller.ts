import { Controller } from '@nestjs/common'
import { MessagePattern, Payload } from '@nestjs/microservices'
import { IDENTITY_MESSAGE_PATTERNS } from '@libs/constants/message-patterns.constant'
import { AppService } from './app.service'
import { SaveVoteSecretBackupArgs } from '@libs/types/identity/auth.type'

@Controller()
export class AppController {
    constructor(private readonly appService: AppService) {}

    @MessagePattern(IDENTITY_MESSAGE_PATTERNS.SAVE_VOTE_SECRET_BACKUP)
    async saveVoteSecretBackup(@Payload() dto: SaveVoteSecretBackupArgs) {
        return await this.appService.saveVoteSecretBackup(dto)
    }

    @MessagePattern(IDENTITY_MESSAGE_PATTERNS.GET_VOTE_SECRET_BACKUP)
    async getVoteSecretBackup(@Payload() dto: Pick<SaveVoteSecretBackupArgs, 'userId'>) {
        return await this.appService.getVoteSecretBackup(dto)
    }
}
