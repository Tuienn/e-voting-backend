import { Body, Controller, HttpStatus, Post } from '@nestjs/common'
import { AppService } from './app.service'
import { CreateVoterDto } from '@libs/types/user.dto'
import { ApiBody } from '@nestjs/swagger'
import { ResponseDto } from '@libs/types/response.dto'
@Controller()
export class AppController {
    constructor(private readonly appService: AppService) {}

    //SECTION - Identity route
    @Post('identity/user/create-voter')
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
}
