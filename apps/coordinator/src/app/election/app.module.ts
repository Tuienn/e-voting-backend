import { forwardRef, Global, Module } from '@nestjs/common'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { VoteModule } from '../vote/app.module'

@Global()
@Module({
    imports: [forwardRef(() => VoteModule)],
    controllers: [AppController],
    providers: [AppService],
    exports: [AppService]
})
export class ElectionModule {}
