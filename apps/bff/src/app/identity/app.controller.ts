import { Body, Controller, Delete, Get, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common'
import { AppService } from './app.service'
import { CreateVoterDto, FilterUsersDto, UpdateUserByIdDto } from '@libs/types/identity/user.dto'
import { ApiBody, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger'
import { ResponseDto } from '@libs/types/response.dto'
import { RefreshTokenDto, SignInDto } from '@libs/types/identity/auth.dto'
import { MongoIdDto } from '@libs/types/common.dto'
import { Public } from '@libs/decorators/public.decorator'
import { Roles } from '@libs/decorators/roles.decorator'

@ApiTags('Identity')
@Controller('identity')
export class AppController {
    constructor(private readonly appService: AppService) {}

    //SECTION - Identity - User
    @Roles('ADMIN')
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

    @Roles('ADMIN')
    @Patch('user/:id/disable')
    @ApiParam({ name: 'id', type: String, description: 'User ID' })
    async disableUserById(@Param() dto: MongoIdDto) {
        await this.appService.disableUserById(dto)

        return new ResponseDto({
            message: 'User disabled successfully',
            statusCode: HttpStatus.OK
        })
    }

    @Roles('ADMIN')
    @Patch('user/:id/enable')
    @ApiParam({ name: 'id', type: String, description: 'User ID' })
    async enableUserById(@Param() dto: MongoIdDto) {
        await this.appService.enableUserById(dto)

        return new ResponseDto({
            message: 'User enabled successfully',
            statusCode: HttpStatus.OK
        })
    }

    @Roles('ADMIN')
    @Get('user/filter')
    @ApiQuery({ name: 'email', required: false, type: String })
    @ApiQuery({ name: 'name', required: false, type: String })
    @ApiQuery({ name: 'isActive', required: false, type: Boolean })
    @ApiQuery({ name: 'page', required: false, type: Number })
    @ApiQuery({ name: 'pageSize', required: false, type: Number })
    async filterUsers(@Query() dto: FilterUsersDto) {
        const result = await this.appService.filterUsers(dto)

        return new ResponseDto({
            data: result,
            message: 'Users retrieved successfully',
            statusCode: HttpStatus.OK
        })
    }

    @Roles('ADMIN')
    @Get('user/:id')
    @ApiParam({ name: 'id', type: String, description: 'User ID' })
    async getUserById(@Param() dto: MongoIdDto) {
        const result = await this.appService.getUserById(dto)

        return new ResponseDto({
            data: result,
            message: 'User retrieved successfully',
            statusCode: HttpStatus.OK
        })
    }

    @Roles('ADMIN')
    @Patch('user/:id')
    @ApiParam({ name: 'id', type: String, description: 'User ID' })
    @ApiBody({
        type: UpdateUserByIdDto,
        examples: {
            example1: {
                value: { email: 'john.doe@example.com', name: 'John Doe' }
            }
        }
    })
    async updateUserById(@Param() dto: MongoIdDto, @Body() data: UpdateUserByIdDto) {
        const result = await this.appService.updateUserById({ ...dto, ...data })

        return new ResponseDto({
            data: result,
            message: 'User updated successfully',
            statusCode: HttpStatus.OK
        })
    }

    @Roles('ADMIN')
    @Delete('user/:id')
    @ApiParam({ name: 'id', type: String, description: 'User ID' })
    async deleteUserById(@Param() dto: MongoIdDto) {
        await this.appService.deleteUserById(dto)

        return new ResponseDto({
            message: 'User deleted successfully',
            statusCode: HttpStatus.OK
        })
    }

    //SECTION - Identity - Auth
    @Public()
    @Post('auth/sign-in')
    @ApiBody({
        type: SignInDto,
        examples: {
            example1: {
                value: { email: 'john.doe@example.com', password: 'password123' }
            },
            admin: {
                value: { email: 'admin@example.com', password: '12345678' }
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
