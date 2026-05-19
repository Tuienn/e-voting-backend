import { ApiBody, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger'
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common'
import { AppService } from './app.service'
import { CreateElectionDto, FilterElectionsDto, VoterIdsDto } from '@libs/types/coordinator/election.dto'
import { Public } from '@libs/decorators/public.decorator'
import { Roles } from '@libs/decorators/roles.decorator'
import { ResponseDto } from '@libs/types/response.dto'
import { MongoIdDto } from '@libs/types/common.dto'
import { CurrentUser } from '@libs/decorators/current-user.decorator'
import { RequestWithUser } from '@libs/types/identity/auth.type'
import { SignBlindedVoteDto, SubmitBlindedCommitmentDto, VerifyVoteDto } from '@libs/types/coordinator/vote.dto'

@ApiTags('Coordinator')
@Controller('coordinator')
export class AppController {
    constructor(private readonly appService: AppService) {}

    //SECTION - Coordinator - Election
    @Public()
    @Get('election/filter')
    @ApiQuery({ name: 'name', required: false, type: String })
    @ApiQuery({ name: 'status', required: false, type: String, enum: ['PENDING', 'ACTIVE', 'COMPLETED'] })
    @ApiQuery({ name: 'startDate', required: false, type: String, format: 'date-time' })
    @ApiQuery({ name: 'endDate', required: false, type: String, format: 'date-time' })
    @ApiQuery({ name: 'page', required: false, type: Number })
    @ApiQuery({ name: 'pageSize', required: false, type: Number })
    async filterElections(@Query() dto: FilterElectionsDto) {
        const result = await this.appService.filterElections(dto)

        return new ResponseDto({
            data: result,
            message: 'Elections retrieved successfully',
            statusCode: HttpStatus.OK
        })
    }

    @Roles('ADMIN')
    @Post('election/create')
    @HttpCode(HttpStatus.CREATED)
    @ApiBody({
        type: CreateElectionDto,
        examples: {
            example1: {
                value: { name: 'Election 1', candidateIds: ['69f5b5475c48c621a0681cbc', '69ef6ddc1577a677366cd218'] }
            }
        }
    })
    async createElection(@Body() dto: CreateElectionDto) {
        const result = await this.appService.createElection(dto)

        return new ResponseDto({
            data: result,
            message: 'Election created successfully',
            statusCode: HttpStatus.CREATED
        })
    }

    @Roles('ADMIN')
    @Post('election/:id/add-voters')
    @ApiParam({
        name: 'id',
        type: String,
        description: 'Election ID',
        examples: { example1: { value: '69f5b5475c48c621a0681cbc' } }
    })
    @ApiBody({
        type: VoterIdsDto,
        examples: {
            example1: { value: { voterIds: ['69f5b5475c48c621a0681cbc', '69ef6ddc1577a677366cd218'] } }
        }
    })
    async addVotersToElection(@Param() electionIdDto: MongoIdDto, @Body() voterIdsDto: VoterIdsDto) {
        const result = await this.appService.addVotersToElection({
            id: electionIdDto.id,
            voterIds: voterIdsDto.voterIds
        })

        return new ResponseDto({
            data: result,
            message:
                result.electionVoters && result.electionVoters.length > 0
                    ? `${result.electionVoters.length} voters added to election successfully`
                    : 'No voters added to election',
            statusCode: HttpStatus.OK
        })
    }

    @Roles('ADMIN')
    @Patch('election/:id/start')
    @ApiParam({
        name: 'id',
        type: String,
        description: 'Election ID',
        examples: {
            example1: { value: '69f5b5475c48c621a0681cbc' }
        }
    })
    async startElection(@Param() dto: MongoIdDto) {
        const result = await this.appService.startElection(dto)

        return new ResponseDto({
            data: result,
            message: 'Election started successfully',
            statusCode: HttpStatus.OK
        })
    }

    @Roles('ADMIN')
    @Patch('election/:id/close')
    @ApiParam({
        name: 'id',
        type: String,
        description: 'Election ID',
        examples: { example1: { value: '69f5b5475c48c621a0681cbc' } }
    })
    async closeElection(@Param() dto: MongoIdDto) {
        const result = await this.appService.closeElection(dto)

        return new ResponseDto({
            data: result,
            message: 'Election closed successfully',
            statusCode: HttpStatus.OK
        })
    }

    @Roles('ADMIN')
    @Get('election/:id')
    @ApiParam({
        name: 'id',
        type: String,
        description: 'Election ID',
        examples: { example1: { value: '69f5b5475c48c621a0681cbc' } }
    })
    async getElectionById(@Param() dto: MongoIdDto) {
        const result = await this.appService.getElectionById(dto)

        return new ResponseDto({
            data: result,
            message: 'Election retrieved successfully',
            statusCode: HttpStatus.OK
        })
    }

    //SECTION - Coordinator - Vote
    @Roles('VOTER')
    @Post('vote/:id/start-session')
    @ApiParam({
        name: 'id',
        type: String,
        description: 'Election ID',
        examples: { example1: { value: '69f6a3eac5bfa7c9d91adccb' } }
    })
    @HttpCode(HttpStatus.OK)
    async startVoteSession(@Param() dto: MongoIdDto, @CurrentUser() user: RequestWithUser) {
        const result = await this.appService.startVoteSession({
            electionId: dto.id,
            voterId: user.userId
        })

        return new ResponseDto({
            data: result,
            message: 'Vote session started successfully',
            statusCode: HttpStatus.OK
        })
    }

    @Roles('VOTER')
    @Post('vote/sign')
    @ApiBody({
        type: SignBlindedVoteDto,
        examples: {
            example1: {
                value: {
                    rHex: '1234567890',
                    sessionId: 'aef44e20-48d8-4817-a1ae-3cfe79f9e049'
                }
            }
        }
    })
    @HttpCode(HttpStatus.OK)
    async signBlindedVote(@Body() dto: Omit<SignBlindedVoteDto, 'voterId'>, @CurrentUser() user: RequestWithUser) {
        const result = await this.appService.signBlindedVote({
            ...dto,
            voterId: user.userId
        })

        return new ResponseDto({
            data: result,
            message: 'Blinded vote signed successfully',
            statusCode: HttpStatus.OK
        })
    }

    @Roles('VOTER')
    @Post('vote/:electionId/submit-blinded-commitment')
    @ApiParam({
        name: 'electionId',
        type: String,
        description: 'Election ID',
        examples: { example1: { value: '69f6a3eac5bfa7c9d91adccb' } }
    })
    @ApiBody({
        type: SubmitBlindedCommitmentDto,
        examples: {
            example1: {
                value: {
                    blindedCommitment: '1234567890',
                    signatureHex: '1234567890',
                    sessionId: 'aef44e20-48d8-4817-a1ae-3cfe79f9e049'
                }
            }
        }
    })
    @HttpCode(HttpStatus.OK)
    async submitBlindedCommitment(
        @Param() params: Pick<SubmitBlindedCommitmentDto, 'electionId'>,
        @Body() dto: Omit<SubmitBlindedCommitmentDto, 'electionId' | 'voterId'>,
        @CurrentUser() user: RequestWithUser
    ) {
        const result = await this.appService.submitBlindedCommitment({
            ...dto,
            electionId: params.electionId,
            voterId: user.userId
        })

        return new ResponseDto({
            data: result,
            message: 'Blinded commitment submitted, vote created successfully',
            statusCode: HttpStatus.OK
        })
    }

    @Public()
    @Post('vote/:id/verify')
    @HttpCode(HttpStatus.OK)
    @ApiParam({
        name: 'id',
        type: String,
        description: 'Vote ID',
        examples: { example1: { value: '69f6a3eac5bfa7c9d91adccb' } }
    })
    @ApiBody({
        type: VerifyVoteDto,
        examples: {
            example1: {
                value: {
                    electionId: '69f6a3eac5bfa7c9d91adccb',
                    blindedCommitment: '1234567890',
                    blockchainRef: '1234567890'
                }
            }
        }
    })
    @HttpCode(HttpStatus.OK)
    async verifyVote(@Param('id') voteId: string, @Body() dto: Omit<VerifyVoteDto, 'id'>) {
        const result = await this.appService.verifyVote({
            ...dto,
            id: voteId
        })

        return new ResponseDto({
            data: result,
            message: 'Vote verified successfully',
            statusCode: HttpStatus.OK
        })
    }
}
