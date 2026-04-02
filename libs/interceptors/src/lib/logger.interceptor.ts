import { LogFormatter } from '@libs/utils/log-formatter.util'
import { UploadedFileLog, UploadedFilesLog } from '@libs/types/logger.type'
import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common'
import { Request, Response } from 'express'
import { v4 as uuidv4 } from 'uuid'

interface RequestWithLogMeta extends Request {
    processId?: string
    files?: UploadedFilesLog
    file?: UploadedFileLog
}

interface HttpLogEntry {
    processId: string
    timestamp: {
        start: number
        end: number
    }
    duration: string
    request: {
        method: string
        url: string
        body: unknown
    }
    response: {
        statusCode: number
        body: unknown
    }
}

@Injectable()
export class HttpLoggerInterceptor implements NestInterceptor {
    private readonly logger = new Logger(HttpLoggerInterceptor.name)

    intercept(context: ExecutionContext, next: CallHandler) {
        if (context.getType() !== 'http') {
            return next.handle()
        }

        const httpContext = context.switchToHttp()
        const req = httpContext.getRequest<Request>()
        const res = httpContext.getResponse<Response>()
        const request = req as RequestWithLogMeta
        const processId = req.headers['x-request-id']?.toString() || uuidv4()
        const startTime = Date.now()

        request.processId = processId

        const chunks: Buffer[] = []
        const originalWrite = res.write.bind(res)
        const originalEnd = res.end.bind(res)
        let restored = false

        const restoreResponseMethods = () => {
            if (restored) return

            res.write = originalWrite as typeof res.write
            res.end = originalEnd as typeof res.end
            restored = true
        }

        const captureChunk = (chunk: unknown) => {
            if (chunk === undefined || chunk === null) return

            if (Buffer.isBuffer(chunk)) {
                chunks.push(chunk)
                return
            }

            if (typeof chunk === 'string' || chunk instanceof Uint8Array) {
                chunks.push(Buffer.from(chunk))
                return
            }

            chunks.push(Buffer.from(String(chunk)))
        }

        type WriteArgs = Parameters<Response['write']>
        type EndArgs = Parameters<Response['end']>

        res.write = ((...args: WriteArgs) => {
            captureChunk(args[0])
            return originalWrite(...args)
        }) as typeof res.write

        res.end = ((...args: EndArgs) => {
            captureChunk(args[0])

            const duration = Date.now() - startTime

            const contentTypeHeader = res.getHeader('content-type') as string | undefined
            const rawBuffer = Buffer.concat(chunks)

            let parsedBody: unknown
            if (!rawBuffer.length) {
                parsedBody = null
            } else if (contentTypeHeader?.includes('application/json')) {
                try {
                    parsedBody = JSON.parse(rawBuffer.toString('utf8'))
                } catch {
                    parsedBody = '[Invalid JSON response]'
                }
            } else if (
                contentTypeHeader &&
                (contentTypeHeader.startsWith('image/') ||
                    contentTypeHeader.includes('application/pdf') ||
                    contentTypeHeader.includes('application/octet-stream'))
            ) {
                parsedBody = {
                    type: contentTypeHeader,
                    length: rawBuffer.length
                }
            } else {
                const text = rawBuffer.toString('utf8')
                parsedBody = text.length > 500 ? `${text.substring(0, 500)}...[truncated]` : text
            }

            const files = request.files ?? request.file
            const formattedReqBody = LogFormatter.formatBody(req.body, files)

            const logEntry: HttpLogEntry = {
                processId,
                timestamp: {
                    start: startTime,
                    end: Date.now()
                },
                duration: `${duration}ms`,
                request: {
                    method: req.method,
                    url: req.originalUrl,
                    body: formattedReqBody
                },
                response: {
                    statusCode: res.statusCode,
                    body: parsedBody
                }
            }

            if (process.env['NODE_ENV'] !== 'production') {
                this.prettyPrint(logEntry)
            } else {
                this.logger.log(JSON.stringify(logEntry))
            }

            const result = originalEnd(...args)
            restoreResponseMethods()

            return result
        }) as typeof res.end

        res.once('finish', restoreResponseMethods)
        res.once('close', restoreResponseMethods)

        return next.handle()
    }

    /**
     * In log dạng colorful cho development - dễ nhìn, trực quan
     */
    private prettyPrint(log: HttpLogEntry) {
        const { cyan, green, magenta, gray } = {
            cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
            green: (s: string) => `\x1b[32m${s}\x1b[0m`,
            magenta: (s: string) => `\x1b[35m${s}\x1b[0m`,
            gray: (s: string) => `\x1b[90m${s}\x1b[0m`
        }

        const formatLogValue = (value: unknown): string => {
            const serialized = JSON.stringify(value, null, 2)
            if (serialized !== undefined) return serialized
            return String(value)
        }

        Logger.log(
            `
${gray('════════════════════════════════════════')}
${cyan('🔍 HTTP LOG')} ${gray(`[${log.processId.slice(0, 8)}]`)}
${gray('────────────────────────────────────')}
⏱️  ${gray('Duration:')} ${green(log.duration)}
📥 ${gray('Request:')} ${magenta(log.request.method)} ${log.request.url}
${gray('   Body:')}${formatLogValue(log.request.body)
                .split('\n')
                .map((l) => '   ' + l)
                .join('\n')}
📤 ${gray('Response:')} ${this.getStatusCodeColor(log.response.statusCode)}${log.response.statusCode}${gray(' -')}${formatLogValue(
                log.response.body
            )
                .split('\n')
                .map((l) => '   ' + l)
                .join('\n')}
${gray('════════════════════════════════════════')}
	`.trim()
        )
    }

    private getStatusCodeColor(code: number): string {
        if (code >= 500) return '\x1b[31m'
        if (code >= 400) return '\x1b[33m'
        if (code >= 300) return '\x1b[36m'
        return '\x1b[32m'
    }
}
