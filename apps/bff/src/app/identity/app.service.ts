import { MongoIdDto } from '@libs/types/common.dto'
import { RefreshTokenDto, SignInDto } from '@libs/types/identity/auth.dto'
import { Inject, Injectable } from '@nestjs/common'
import { ClientProxy } from '@nestjs/microservices'
import { lastValueFrom } from 'rxjs'
import { CONFIGURATION } from '../../configuration'
import { IDENTITY_MESSAGE_PATTERNS } from '@libs/constants/message-patterns.constant'
import { CreateVoterDto, FilterUsersDto, UpdateUserByIdDto } from '@libs/types/identity/user.dto'

@Injectable()
export class AppService {
    constructor(@Inject(`TCP_${CONFIGURATION.SERVICE_NAME}`) private readonly userClient: ClientProxy) {}

    //SECTION - Identity - User
    async createVoter(dto: CreateVoterDto) {
        return lastValueFrom(this.userClient.send(IDENTITY_MESSAGE_PATTERNS.CREATE_VOTER, dto))
    }

    async getUserById(dto: MongoIdDto) {
        return lastValueFrom(this.userClient.send(IDENTITY_MESSAGE_PATTERNS.GET_USER_BY_ID, dto))
    }

    async disableUserById(dto: MongoIdDto) {
        return lastValueFrom(this.userClient.send(IDENTITY_MESSAGE_PATTERNS.DISABLE_USER_BY_ID, dto))
    }

    async enableUserById(dto: MongoIdDto) {
        return lastValueFrom(this.userClient.send(IDENTITY_MESSAGE_PATTERNS.ENABLE_USER_BY_ID, dto))
    }

    async deleteUserById(dto: MongoIdDto) {
        return this.userClient.send(IDENTITY_MESSAGE_PATTERNS.DELETE_USER_BY_ID, dto)
    }

    async updateUserById(dto: MongoIdDto & UpdateUserByIdDto) {
        return lastValueFrom(this.userClient.send(IDENTITY_MESSAGE_PATTERNS.UPDATE_USER_BY_ID, dto))
    }

    async filterUsers(dto: FilterUsersDto) {
        return lastValueFrom(this.userClient.send(IDENTITY_MESSAGE_PATTERNS.FILTER_USERS, dto))
    }

    //SECTION - Identity - Auth
    async signIn(dto: SignInDto) {
        return lastValueFrom(this.userClient.send(IDENTITY_MESSAGE_PATTERNS.SIGN_IN, dto))
    }

    async refreshToken(dto: RefreshTokenDto) {
        return lastValueFrom(this.userClient.send(IDENTITY_MESSAGE_PATTERNS.REFRESH_TOKEN, dto))
    }

    async signOut(dto: RefreshTokenDto) {
        return lastValueFrom(this.userClient.send(IDENTITY_MESSAGE_PATTERNS.SIGN_OUT, dto))
    }
}
