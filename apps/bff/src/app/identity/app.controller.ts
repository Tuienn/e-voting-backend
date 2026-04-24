import { Body, Controller, HttpStatus, Post } from '@nestjs/common'
import { AppService } from './app.service'
import { CreateVoterDto } from '@libs/types/identity/user.dto'
import { ApiBody, ApiTags } from '@nestjs/swagger'
import { ResponseDto } from '@libs/types/response.dto'
import { RefreshTokenDto, SignInDto } from '@libs/types/identity/auth.dto'

@ApiTags('Identity')
@Controller('identity')
export class AppController {
    constructor(private readonly appService: AppService) {}

    //SECTION - Identity - User
    @Post('user/create-voter')
    @ApiBody({
        type: CreateVoterDto,
        examples: {
            example1: {
                value: { email: 'john.doe@example.com', password: 'password123', name: 'John Doe' }
            }
        }
    })
    async createVoter(@Body() data: CreateVoterDto) {
        const result = await this.appService.createVoter(data)

        return new ResponseDto({
            data: result,
            message: 'Voter created successfully',
            statusCode: HttpStatus.CREATED
        })
    }

    //SECTION - Identity - Auth
    @Post('auth/sign-in')
    @ApiBody({
        type: SignInDto,
        examples: {
            example1: {
                value: { email: 'john.doe@example.com', password: 'password123' }
            }
        }
    })
    async signIn(@Body() data: SignInDto) {
        const result = await this.appService.signIn(data)

        return new ResponseDto({
            data: result,
            message: 'Signed in successfully',
            statusCode: HttpStatus.OK
        })
    }

    @Post('auth/refresh-token')
    @ApiBody({
        type: RefreshTokenDto,
        examples: {
            example1: {
                value: { refreshToken: 'your-refresh-token-here' }
            }
        }
    })
    async refreshToken(@Body() refreshToken: RefreshTokenDto) {
        const result = await this.appService.refreshToken(refreshToken)

        return new ResponseDto({
            data: result,
            message: 'Token refreshed successfully',
            statusCode: HttpStatus.OK
        })
    }

    @Post('auth/sign-out')
    @ApiBody({
        type: RefreshTokenDto,
        examples: {
            example1: {
                value: { refreshToken: 'your-refresh-token-here' }
            }
        }
    })
    async signOut(@Body() refreshToken: RefreshTokenDto) {
        await this.appService.signOut(refreshToken)

        return new ResponseDto({
            message: 'Signed out successfully',
            statusCode: HttpStatus.OK
        })
    }
}
