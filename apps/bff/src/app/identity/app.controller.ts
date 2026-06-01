import { CurrentUser } from '@libs/decorators/current-user.decorator'
import {
    BadRequestException,
    Body,
    Controller,
    Delete,
    Get,
    Headers,
    HttpCode,
    HttpStatus,
    Param,
    Patch,
    Post,
    Query,
    UnauthorizedException,
    UploadedFile,
    UseInterceptors
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { AppService } from './app.service'
import { CreateBulkUsersDto, CreateUserDto, FilterUsersDto, UpdateUserByIdDto } from '@libs/types/identity/user.dto'
import { read, utils } from 'xlsx'
import { SaveVoteSecretBackupDto } from '@libs/types/identity/backup.dto'
import { ApiBody, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger'
import { ResponseDto } from '@libs/types/response.dto'
import { RefreshTokenDto, SignInDto } from '@libs/types/identity/auth.dto'
import { MongoIdDto, MongoIdsDto } from '@libs/types/common.dto'
import { Public } from '@libs/decorators/public.decorator'
import { Roles } from '@libs/decorators/roles.decorator'
import { ROLE_ARRAY } from '@libs/constants/common.constant'
import { RequestWithUser } from '@libs/types/identity/auth.type'
import { CONFIGURATION } from '../../configuration'

@ApiTags('Identity')
@Controller('identity')
export class AppController {
    constructor(private readonly appService: AppService) {}

    //SECTION - Identity - User

    @Roles('ADMIN')
    @Post('user/create-user')
    @ApiBody({
        type: CreateUserDto,
        examples: {
            voter: {
                value: { email: 'voter1@example.com', password: 'password123', name: 'John Doe', role: 'VOTER' }
            },
            candidate: {
                value: { email: 'candidate1@example.com', password: 'password123', name: 'Jane Doe', role: 'CANDIDATE' }
            },
            admin: {
                value: { email: 'admin@example.com', password: '12345678', name: 'Admin', role: 'ADMIN' }
            }
        }
    })
    async createUser(@Body() data: CreateUserDto) {
        const result = await this.appService.createUser(data)

        return new ResponseDto({
            data: result,
            message: 'User created successfully',
            statusCode: HttpStatus.CREATED
        })
    }

    @Roles('ADMIN')
    @Post('user/create-bulk-users')
    @ApiBody({
        type: [CreateBulkUsersDto],
        examples: {
            example1: {
                value: {
                    data: [
                        { email: 'voter1@example.com', password: 'password123', name: 'John Doe' },
                        { email: 'voter2@example.com', password: 'password123', name: 'Jane Doe' },
                        { email: 'voter3@example.com', password: 'password123', name: 'Doe Smith' },
                        {
                            email: 'candidate1@example.com',
                            password: 'password123',
                            name: 'Emily Jones',
                            role: 'CANDIDATE'
                        },
                        {
                            email: 'candidate2@example.com',
                            password: 'password123',
                            name: 'Michael Brown',
                            role: 'CANDIDATE'
                        }
                    ]
                }
            }
        }
    })
    async createBulkUsers(@Body() dto: CreateBulkUsersDto) {
        const result = (await this.appService.createBulkUsers(dto)) ?? { count: 0 }

        return new ResponseDto({
            data: result,
            message: result.count > 0 ? `${result.count} users created successfully` : 'No users created',
            statusCode: HttpStatus.CREATED
        })
    }

    @Roles('ADMIN')
    @Post('user/import-excel')
    @UseInterceptors(FileInterceptor('file'))
    async importUsersFromExcel(@UploadedFile() file: Express.Multer.File) {
        if (!file) {
            throw new BadRequestException('No file uploaded')
        }

        const workbook = read(file.buffer, { type: 'buffer', codepage: 65001 })
        const worksheet = workbook.Sheets[workbook.SheetNames[0]]
        const rows = utils.sheet_to_json<Record<string, string>>(worksheet, { defval: '' })

        if (!rows.length) {
            throw new BadRequestException('Excel file is empty or has no valid data')
        }

        const data = rows.map((row) => ({
            email: (row['email'] ?? row['Email'] ?? '').toString().trim(),
            password: (row['password'] ?? row['Password'] ?? '').toString().trim(),
            name: (row['name'] ?? row['Name'] ?? '').toString().trim(),
            role: ((row['role'] ?? row['Role'] ?? '') as string).toString().trim() || undefined
        }))

        const result = (await this.appService.createBulkUsers({ data })) ?? { count: 0 }

        return new ResponseDto({
            data: result,
            message: result.count > 0 ? `${result.count} users imported successfully` : 'No users imported',
            statusCode: HttpStatus.CREATED
        })
    }

    @Roles('ADMIN')
    @Delete('user/bulk')
    @ApiBody({
        type: [MongoIdsDto],
        examples: {
            example1: {
                value: { ids: ['60d0fe4f5311236168a109ca', '60d0fe4f5311236168a109cb'] }
            }
        }
    })
    async deleteBulkUsersByIds(@Body() dto: MongoIdsDto) {
        const result = (await this.appService.deleteBulkUsersByIds(dto)) ?? { count: 0 }

        return new ResponseDto({
            message: result.count > 0 ? `${result.count} users deleted successfully` : 'No users deleted',
            statusCode: HttpStatus.OK
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
    @ApiQuery({ name: 'role', required: false, type: String, enum: ROLE_ARRAY })
    async filterUsers(@Query() dto: FilterUsersDto) {
        const result = await this.appService.filterUsers(dto)

        return new ResponseDto({
            data: result,
            message: 'Users retrieved successfully',
            statusCode: HttpStatus.OK
        })
    }

    @Roles('ADMIN')
    @Get('user/:id/all')
    @ApiParam({ name: 'id', type: String, description: 'User ID' })
    async getAllInfoUserById(@Param() dto: MongoIdDto) {
        const result = await this.appService.getAllInfoUserById(dto)

        return new ResponseDto({
            data: result,
            message: 'User retrieved successfully',
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
            voter: {
                value: { email: 'voter@example.com', name: 'John Doe' }
            },
            candidate: {
                value: { email: 'candidate@example.com', name: 'Jane Doe', role: 'CANDIDATE' }
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
    @Get('auth/me')
    async getMyProfile(@CurrentUser() user: RequestWithUser) {
        const result = await this.appService.getUserById({ id: user.userId })

        return new ResponseDto({
            data: result,
            message: 'Get profile successfully'
        })
    }

    //SECTION - Identity - Vote secret backup (user đã đăng nhập tự thao tác trên dữ liệu của chính mình)
    @Post('me/vote-secret-backup')
    @ApiBody({
        type: SaveVoteSecretBackupDto,
        examples: {
            example1: {
                value: {
                    payload: '{"v":1,"kdf":{"algo":"PBKDF2-SHA256","iter":100000,"salt":"..."},"enc":{...}}'
                }
            }
        }
    })
    async saveVoteSecretBackup(@CurrentUser() user: RequestWithUser, @Body() dto: SaveVoteSecretBackupDto) {
        const result = await this.appService.saveVoteSecretBackup({ payload: dto.payload, userId: user.userId })

        return new ResponseDto({
            data: result,
            message: 'Vote secret backup saved successfully',
            statusCode: HttpStatus.OK
        })
    }

    @Get('me/vote-secret-backup')
    async getVoteSecretBackup(@CurrentUser() user: RequestWithUser) {
        const result = await this.appService.getVoteSecretBackup(user.userId)

        return new ResponseDto({
            data: result,
            message: result ? 'Vote secret backup retrieved successfully' : 'No vote secret backup found'
        })
    }

    @Public()
    @HttpCode(HttpStatus.OK)
    @Post('auth/sign-in')
    @ApiBody({
        type: SignInDto,
        examples: {
            voter: {
                value: { email: 'voter@example.com', password: 'password123' }
            },
            admin: {
                value: { email: 'admin@example.com', password: '12345678' }
            }
        }
    })
    async signIn(@Headers() headers: Record<string, string>, @Body() data: SignInDto) {
        const result = await this.appService.signIn(data)

        if (
            ['VOTER', 'CANDIDATE'].includes(result.role) &&
            headers.origin === CONFIGURATION.BFF_CONFIG.ADMIN_WEB_ORIGIN
        ) {
            throw new UnauthorizedException('Only admin users can access the admin web')
        }

        if (['ADMIN', 'CANDIDATE'].includes(result.role) && headers['x-client-platform'] === 'mobile') {
            throw new UnauthorizedException('Only admin users can access the mobile app')
        }

        return new ResponseDto({
            data: result,
            message: 'Signed in successfully',
            statusCode: HttpStatus.OK
        })
    }

    @Public()
    @Post('auth/refresh-token')
    @HttpCode(HttpStatus.OK)
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
    @HttpCode(HttpStatus.OK)
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
