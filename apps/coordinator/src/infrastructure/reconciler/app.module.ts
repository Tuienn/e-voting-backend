import { Module } from '@nestjs/common'
import { ScheduleModule } from '@nestjs/schedule'
import { ReconcilerService } from './app.service'

//NOTE - PrismaModule và FabricClientModule đều là @Global nên không cần import lại ở đây
@Module({
    imports: [ScheduleModule.forRoot()],
    providers: [ReconcilerService]
})
export class ReconcilerModule {}
