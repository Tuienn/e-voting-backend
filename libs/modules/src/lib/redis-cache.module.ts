import { DynamicModule, Global, Module } from '@nestjs/common'
import { CacheModule } from '@nestjs/cache-manager'
import KeyvRedis, { Keyv } from '@keyv/redis'
import { KeyvCacheableMemory } from 'cacheable'
import { getRedisTlsOptions } from '@libs/configuration/mtls.config'

export type RedisCacheConfig = {
    ttl: number
    host: string
    port: number
    password?: string
    lruSize?: number
}

const createRedisConnectionUrl = ({ host, port, password }: RedisCacheConfig, useTls: boolean): string => {
    const scheme = useTls ? 'rediss' : 'redis'

    if (!password) {
        return `${scheme}://${host}:${port}`
    }

    return `${scheme}://:${password}@${host}:${port}`
}

//NOTE - Tạo store Redis cho cache. Khi mTLS bật (MTLS_ENABLED=true) thì dùng rediss:// và truyền
//       cert client xuống socket TLS của node-redis; ngược lại dùng redis:// thường (dev).
const createRedisStore = (config: RedisCacheConfig) => {
    const tls = getRedisTlsOptions()
    const url = createRedisConnectionUrl(config, !!tls)

    if (!tls) {
        return new KeyvRedis(url)
    }

    return new KeyvRedis({
        url,
        socket: { tls: true, ...tls }
    })
}

@Global()
@Module({})
export class RedisCacheModule {
    static register(config: RedisCacheConfig): DynamicModule {
        return {
            module: RedisCacheModule,
            imports: [
                CacheModule.registerAsync({
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
                            createRedisStore(config)
                        ]
                    })
                })
            ],
            exports: [CacheModule]
        }
    }
}
