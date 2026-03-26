import { Injectable } from '@nestjs/common';
import { PORT } from '@libs/constants/env.constant';

@Injectable()
export class AppService {
  getData(): { message: string } {
    return { message: `Hello API on port ${PORT}` };
  }
}
