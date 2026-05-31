import { Module } from '@nestjs/common'
import { ReconcilerService } from './app.service'

//NOTE - PrismaModule và FabricClientModule đều là @Global nên không cần import lại ở đây
@Module({
    providers: [ReconcilerService]
})
export class ReconcilerModule {}
