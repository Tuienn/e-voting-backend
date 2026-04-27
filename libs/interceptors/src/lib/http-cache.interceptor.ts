import { ExecutionContext, Injectable, Logger } from '@nestjs/common'
import { CacheInterceptor } from '@nestjs/cache-manager'
import { Observable } from 'rxjs'
import { CallHandler } from '@nestjs/common'

@Injectable()
export class HttpCacheInterceptor extends CacheInterceptor {
    private readonly logger = new Logger(HttpCacheInterceptor.name)

    // Override intercept để log cả HIT và MISS chính xác
    override async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
        const key = this.trackBy(context)

        if (key) {
            const cached = await this.cacheManager.get(key)
            if (cached !== null && cached !== undefined) {
                this.logger.log(`X-Cache: HIT — ${key}`)
            } else {
                this.logger.log(`X-Cache: MISS — ${key}`)
            }
        }

        return super.intercept(context, next)
    }

    override trackBy(context: ExecutionContext): string | undefined {
        const request = context.switchToHttp().getRequest()
        const { query, method, path } = request

        if (method !== 'GET') return undefined

        // không có query params vẫn cache theo path
        if (!Object.keys(query).length) return path

        const entries: [string, string][] = Object.keys(query)
            .sort()
            .flatMap((key) => {
                const value = query[key] as string | string[] | undefined
                if (value === undefined) return []
                if (Array.isArray(value)) {
                    return value.map((v) => [key, String(v)] as [string, string])
                }
                return [[key, String(value)] as [string, string]]
            })

        const queryString = new URLSearchParams(entries).toString()
        return `${path}?${queryString}`
    }
}
