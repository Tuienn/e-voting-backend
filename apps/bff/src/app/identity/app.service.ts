import { RefreshTokenDto, SignInDto } from '@libs/types/identity/auth.dto'
import { Inject, Injectable } from '@nestjs/common'
import { ClientProxy } from '@nestjs/microservices'
import { lastValueFrom } from 'rxjs'
import { CONFIGURATION } from '../../configuration'
import { IDENTITY_MESSAGE_PATTERNS } from '@libs/constants/message-patterns.constant'
import { CreateVoterDto } from '@libs/types/identity/user.dto'
import { rpcErrorToHttp } from '@libs/utils/rpc-client-error.util'

@Injectable()
export class AppService {
    constructor(@Inject(`TCP_${CONFIGURATION.SERVICE_NAME}`) private readonly userClient: ClientProxy) {}

    //SECTION - Identity - User
    async createVoter(dto: CreateVoterDto) {
        try {
            return await lastValueFrom(this.userClient.send(IDENTITY_MESSAGE_PATTERNS.CREATE_VOTER, dto))
        } catch (err) {
            throw rpcErrorToHttp(err)
        }
    }

    //SECTION - Identity - Auth
    async signIn(dto: SignInDto) {
        try {
            return await lastValueFrom(this.userClient.send(IDENTITY_MESSAGE_PATTERNS.SIGN_IN, dto))
        } catch (err) {
            throw rpcErrorToHttp(err)
        }
    }

    async refreshToken(dto: RefreshTokenDto) {
        try {
            return await lastValueFrom(this.userClient.send(IDENTITY_MESSAGE_PATTERNS.REFRESH_TOKEN, dto))
        } catch (err) {
            throw rpcErrorToHttp(err)
        }
    }

    async signOut(dto: RefreshTokenDto) {
        try {
            await lastValueFrom(this.userClient.send(IDENTITY_MESSAGE_PATTERNS.SIGN_OUT, dto))
        } catch (err) {
            throw rpcErrorToHttp(err)
        }
    }
}
