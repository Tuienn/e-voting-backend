import { DynamicModule, Global, Module } from '@nestjs/common'
import { CacheModule } from '@nestjs/cache-manager'
import KeyvRedis, { Keyv } from '@keyv/redis'
import { KeyvCacheableMemory } from 'cacheable'

export type RedisCacheConfig = {
    ttl: number
    host: string
    port: number
    password?: string
    lruSize?: number
}

const createRedisConnectionUrl = ({ host, port, password }: RedisCacheConfig): string => {
    if (!password) {
        return `redis://${host}:${port}`
    }

    return `redis://:${password}@${host}:${port}`
}

@Global()
@Module({})
export class RedisCacheModule {
    static register(config: RedisCacheConfig): DynamicModule {
        return {
            module: RedisCacheModule,
            imports: [
                CacheModule.register({
                    isGlobal: true,
                    useFactory: () => ({
                        ttl: config.ttl,
                        stores: [
                            new Keyv({
                                store: new KeyvCacheableMemory({
                                    ttl: config.ttl,
                                    lruSize: config.lruSize ?? 5000
                                })
                            }),
                            new KeyvRedis(createRedisConnectionUrl(config))
                        ]
                    })
                })
            ],
            exports: [CacheModule]
        }
    }
}
