import { forwardRef, Module } from '@nestjs/common'
import { ElectionModule } from '../election/app.module'
import { AppController } from './app.controller'
import { AppService } from './app.service'

@Module({
    imports: [forwardRef(() => ElectionModule)],
    controllers: [AppController],
    providers: [AppService],
    exports: [AppService]
})
export class VoteModule {}
