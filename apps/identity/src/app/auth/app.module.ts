import { Module } from '@nestjs/common'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { TokenModule } from '../../infrastructure/token/token.module'
import { UserModule } from '../user/app.module'

@Module({
    imports: [TokenModule, UserModule],
    controllers: [AppController],
    providers: [AppService]
})
export class AuthModule {}
