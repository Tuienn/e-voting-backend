import { MongoIdDto, MongoIdsDto } from '@libs/types/common.dto'
import { RefreshTokenDto, SignInDto } from '@libs/types/identity/auth.dto'
import { Inject, Injectable } from '@nestjs/common'
import { ClientProxy } from '@nestjs/microservices'
import { lastValueFrom } from 'rxjs'
import { CONFIGURATION } from '../../configuration'
import { IDENTITY_MESSAGE_PATTERNS } from '@libs/constants/message-patterns.constant'
import { CreateBulkUsersDto, CreateUserDto, FilterUsersDto, UpdateUserByIdDto } from '@libs/types/identity/user.dto'

@Injectable()
export class AppService {
    constructor(
        @Inject(`TCP_${CONFIGURATION.BFF_CONFIG.IDENTITY_TCP_NAME}`) private readonly identityClient: ClientProxy
    ) {}

    //SECTION - Identity - User
    async createUser(dto: CreateUserDto) {
        return lastValueFrom(this.identityClient.send(IDENTITY_MESSAGE_PATTERNS.CREATE_USER, dto))
    }

    async getUserById(dto: MongoIdDto) {
        return lastValueFrom(this.identityClient.send(IDENTITY_MESSAGE_PATTERNS.GET_USER_BY_ID, dto))
    }

    async disableUserById(dto: MongoIdDto) {
        return lastValueFrom(this.identityClient.send(IDENTITY_MESSAGE_PATTERNS.DISABLE_USER_BY_ID, dto))
    }

    async enableUserById(dto: MongoIdDto) {
        return lastValueFrom(this.identityClient.send(IDENTITY_MESSAGE_PATTERNS.ENABLE_USER_BY_ID, dto))
    }

    async deleteUserById(dto: MongoIdDto) {
        return this.identityClient.send(IDENTITY_MESSAGE_PATTERNS.DELETE_USER_BY_ID, dto)
    }

    async updateUserById(dto: MongoIdDto & UpdateUserByIdDto) {
        return lastValueFrom(this.identityClient.send(IDENTITY_MESSAGE_PATTERNS.UPDATE_USER_BY_ID, dto))
    }

    async filterUsers(dto: FilterUsersDto) {
        return lastValueFrom(this.identityClient.send(IDENTITY_MESSAGE_PATTERNS.FILTER_USERS, dto))
    }

    async deleteBulkUsersByIds(ids: MongoIdsDto) {
        return lastValueFrom(this.identityClient.send(IDENTITY_MESSAGE_PATTERNS.DELETE_BULK_USERS, ids))
    }

    async createBulkUsers(dto: CreateBulkUsersDto) {
        return lastValueFrom(this.identityClient.send(IDENTITY_MESSAGE_PATTERNS.CREATE_BULK_USERS, dto))
    }

    //SECTION - Identity - Auth
    async signIn(dto: SignInDto) {
        return lastValueFrom(this.identityClient.send(IDENTITY_MESSAGE_PATTERNS.SIGN_IN, dto))
    }

    async refreshToken(dto: RefreshTokenDto) {
        return lastValueFrom(this.identityClient.send(IDENTITY_MESSAGE_PATTERNS.REFRESH_TOKEN, dto))
    }

    async signOut(dto: RefreshTokenDto) {
        return this.identityClient.send(IDENTITY_MESSAGE_PATTERNS.SIGN_OUT, dto)
    }
}
