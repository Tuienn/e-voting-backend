import { MongoIdDto } from '@libs/types/common.dto'
import { BadRequestException, Body, Controller, HttpCode, HttpStatus, Param, Post } from '@nestjs/common'
import { AppService } from './app.service'
import { Public } from '@libs/decorators/public.decorator'
import { ApiBody, ApiParam } from '@nestjs/swagger'
import { RevealVoteDto } from '@libs/types/reveal-vote/app.dto'
import { ResponseDto } from '@libs/types/response.dto'
import { getParams, isValidScalarHex } from '@libs/ec-schnorr'
import { invalidDataField } from '@libs/constants/text.constant'

@Controller('reveal-vote')
export class AppController {
    constructor(private readonly appService: AppService) {}

    //SECTION - Coordinator - Reveal
    @Public()
    @Post('/:id/reveal')
    @HttpCode(HttpStatus.OK)
    @ApiParam({
        name: 'id',
        type: String,
        description: 'Election ID',
        example: '69f6a3eac5bfa7c9d91adccb'
    })
    @ApiBody({
        type: RevealVoteDto,
        examples: {
            example1: {
                value: {
                    candidateId: '69f5b5475c48c621a0681cbc',
                    h: '1234567890',
                    sPrime: '1234567890'
                }
            }
        }
    })
    @HttpCode(HttpStatus.OK)
    async revealVote(@Body() dto: Omit<RevealVoteDto, 'electionId'>, @Param() params: MongoIdDto) {
        const ecParams = getParams()

        if (!isValidScalarHex(dto.h, ecParams.n) || !isValidScalarHex(dto.sPrime, ecParams.n)) {
            throw new BadRequestException(invalidDataField('h or sPrime'))
        }

        const result = await this.appService.revealVote(
            {
                ...dto,
                electionId: params.id
            },
            ecParams
        )

        return new ResponseDto({
            data: result,
            message: 'Vote revealed successfully',
            statusCode: HttpStatus.OK
        })
    }
}
