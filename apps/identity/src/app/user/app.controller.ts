import { Controller } from '@nestjs/common'
import { AppService } from './app.service'
import { MessagePattern, Payload } from '@nestjs/microservices'
import {
    CreateBulkUsersDto,
    CreateUserDto,
    FilterUsersDto,
    GetUserByEmailDto,
    RoleDto
} from '@libs/types/identity/user.dto'
import { IDENTITY_MESSAGE_PATTERNS } from '@libs/constants/message-patterns.constant'
import { MongoIdDto, MongoIdsDto } from '@libs/types/common.dto'
@Controller()
export class AppController {
    constructor(private readonly appService: AppService) {}

    @MessagePattern(IDENTITY_MESSAGE_PATTERNS.CREATE_USER)
    async createUser(@Payload() dto: CreateUserDto) {
        return await this.appService.createUser(dto)
    }

    @MessagePattern(IDENTITY_MESSAGE_PATTERNS.GET_USER_BY_ID)
    async getUserById(@Payload() dto: MongoIdDto) {
        return await this.appService.getUserById(dto)
    }

    @MessagePattern(IDENTITY_MESSAGE_PATTERNS.GET_USER_BY_EMAIL)
    async getUserByEmail(@Payload() dto: GetUserByEmailDto) {
        return await this.appService.getUserByEmail(dto)
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
    async updateUserById(@Payload() dto: MongoIdDto & CreateUserDto) {
        return await this.appService.updateUserById(dto)
    }

    @MessagePattern(IDENTITY_MESSAGE_PATTERNS.FILTER_USERS)
    async filterUsers(@Payload() dto: FilterUsersDto) {
        return await this.appService.filterUsers(dto)
    }

    @MessagePattern(IDENTITY_MESSAGE_PATTERNS.DELETE_BULK_USERS)
    async deleteBulkUsersByIds(@Payload() dto: MongoIdsDto) {
        return await this.appService.deleteBulkUsersByIds(dto)
    }

    @MessagePattern(IDENTITY_MESSAGE_PATTERNS.CREATE_BULK_USERS)
    async createBulkUsers(@Payload() dto: CreateBulkUsersDto) {
        return await this.appService.createBulkUsers(dto)
    }

    @MessagePattern(IDENTITY_MESSAGE_PATTERNS.GET_USERS_BY_IDS)
    async getUsersByMongoIds(@Payload() dto: MongoIdsDto & RoleDto) {
        return await this.appService.getUsersByMongoIds(dto)
    }
}
