import { Controller, Get, HttpStatus } from '@nestjs/common'
import { AppService } from './app.service'
import { ResponseDto } from '@libs/types/response.dto'
@Controller()
export class AppController {
    constructor(private readonly appService: AppService) {}

    @Get()
    getData() {
        const result = this.appService.getData()

        return new ResponseDto({ data: result, statusCode: HttpStatus.OK, message: 'Data retrieved successfully' })
    }
}
