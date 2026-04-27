import { Controller } from '@nestjs/common'
import { AppService } from './app.service'
import { MessagePattern, Payload } from '@nestjs/microservices'
import { CreateVoterDto, FilterUsersDto } from '@libs/types/identity/user.dto'
import { IDENTITY_MESSAGE_PATTERNS } from '@libs/constants/message-patterns.constant'
import { MongoIdDto } from '@libs/types/common.dto'
@Controller()
export class AppController {
    constructor(private readonly appService: AppService) {}

    @MessagePattern(IDENTITY_MESSAGE_PATTERNS.CREATE_VOTER)
    async createVoter(@Payload() dto: CreateVoterDto) {
        return await this.appService.createVoter(dto)
    }

    @MessagePattern(IDENTITY_MESSAGE_PATTERNS.GET_USER_BY_ID)
    async getUserById(@Payload() dto: MongoIdDto) {
        return await this.appService.getUserById(dto)
    }

    @MessagePattern(IDENTITY_MESSAGE_PATTERNS.DISABLE_USER_BY_ID)
    async disableUserById(@Payload() dto: MongoIdDto) {
        return await this.appService.disableUserById(dto)
    }

    @MessagePattern(IDENTITY_MESSAGE_PATTERNS.ENABLE_USER_BY_ID)
    async enableUserById(@Payload() dto: MongoIdDto) {
        return await this.appService.enableUserById(dto)
    }

    @MessagePattern(IDENTITY_MESSAGE_PATTERNS.DELETE_USER_BY_ID)
    async deleteUserById(@Payload() dto: MongoIdDto) {
        await this.appService.deleteUserById(dto)
    }

    @MessagePattern(IDENTITY_MESSAGE_PATTERNS.UPDATE_USER_BY_ID)
    async updateUserById(@Payload() dto: MongoIdDto & CreateVoterDto) {
        return await this.appService.updateUserById(dto)
    }

    @MessagePattern(IDENTITY_MESSAGE_PATTERNS.FILTER_USERS)
    async filterUsers(@Payload() dto: FilterUsersDto) {
        return await this.appService.filterUsers(dto)
    }
}
