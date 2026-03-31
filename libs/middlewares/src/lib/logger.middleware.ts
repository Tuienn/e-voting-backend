import { LogFormatter } from '@libs/utils/log-formatter.util'
// src/common/middleware/http-logger.middleware.ts
import { Injectable, NestMiddleware, Logger } from '@nestjs/common'
import { Request, Response, NextFunction } from 'express'
import { v4 as uuidv4 } from 'uuid'

interface UploadedFile {
    originalname: string
    mimetype: string
    size: number
    encoding: string
}

type UploadedFiles = UploadedFile[] | Record<string, UploadedFile[]>

interface RequestWithLogMeta extends Request {
    processId?: string
    files?: UploadedFiles
    file?: UploadedFile
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
export class HttpLoggerMiddleware implements NestMiddleware {
    private readonly logger = new Logger(HttpLoggerMiddleware.name)

    use(req: Request, res: Response, next: NextFunction) {
        const request = req as RequestWithLogMeta
        const processId = req.headers['x-request-id']?.toString() || uuidv4()
        const startTime = Date.now()

        // Inject processId vào request để dùng ở nơi khác (controller, service)
        request.processId = processId

        // Capture response body bằng cách override write/end
        const chunks: Buffer[] = []
        const originalWrite = res.write.bind(res)
        const originalEnd = res.end.bind(res)

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
            const responseBody = Buffer.concat(chunks).toString('utf8')

            // Parse response body nếu là JSON
            let parsedBody: unknown
            try {
                const contentType = res.getHeader('content-type') as string
                if (contentType?.includes('application/json')) {
                    parsedBody = JSON.parse(responseBody)
                } else {
                    parsedBody = responseBody.substring(0, 500) // Giới hạn độ dài
                }
            } catch {
                parsedBody = responseBody.substring(0, 500)
            }

            // Format request body (handle file upload)
            const files = request.files ?? (request.file ? [request.file] : undefined)
            const formattedReqBody = LogFormatter.formatBody(req.body, files)

            // Log theo format trực quan
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

            // Dùng màu sắc để dễ đọc (chỉ khi dev)
            if (process.env['NODE_ENV'] !== 'production') {
                this.prettyPrint(logEntry)
            } else {
                // Production: log JSON để dễ parse bằng log aggregator
                this.logger.log(JSON.stringify(logEntry))
            }

            return originalEnd(...args)
        }) as typeof res.end

        next()
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
${gray('   Body:')} ${formatLogValue(log.request.body)
                .split('\n')
                .map((l) => '   ' + l)
                .join('\n')}
📤 ${gray('Response:')} ${this.getStatusCodeColor(log.response.statusCode)}${log.response.statusCode}${gray(' -')} ${formatLogValue(
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
        if (code >= 500) return '\x1b[31m' // Red
        if (code >= 400) return '\x1b[33m' // Yellow
        if (code >= 300) return '\x1b[36m' // Cyan
        return '\x1b[32m' // Green
    }
}
