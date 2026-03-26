import { Injectable } from '@nestjs/common';
import { PORT } from '@libs/constants';

@Injectable()
export class AppService {
  getData(): { message: string } {
    console.log('PORT ', PORT);

    return { message: 'Hello API' };
  }
}
