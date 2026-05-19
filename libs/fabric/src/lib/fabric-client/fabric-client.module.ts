import { DynamicModule, Global, Module } from '@nestjs/common'
import { FabricClientService } from './fabric-client.service'
import { FabricClientModuleOptions } from './fabric-client.types'
import { FABRIC_OPTIONS } from './fabric-client.constants'

@Global()
@Module({})
export class FabricClientModule {
    static register(options: FabricClientModuleOptions): DynamicModule {
        return {
            module: FabricClientModule,
            providers: [
                {
                    provide: FABRIC_OPTIONS,
                    useValue: options
                },
                FabricClientService
            ],
            exports: [FabricClientService]
        }
    }
}
