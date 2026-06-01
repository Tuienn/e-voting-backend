import { LogFormatter } from '@libs/utils/log-formatter.util'
import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common'
import { v4 as uuidv4 } from 'uuid'
import { Observable, tap } from 'rxjs'

interface TcpLogEntry {
    processId: string
    transport: 'TCP'
    timestamp: {
        start: number
        end: number
    }
    duration: string
    request: {
        pattern: string
        data: unknown
    }
    response: {
        body: unknown
    }
}

@Injectable()
export class TcpLoggerInterceptor implements NestInterceptor {
    private readonly logger = new Logger(TcpLoggerInterceptor.name)

    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        if (context.getType() !== 'rpc') {
            return next.handle()
        }

        const rpcContext = context.switchToRpc()
        const data = rpcContext.getData()
        const pattern = context.getHandler().name
        const processId = uuidv4()
        const startTime = Date.now()

        const formattedData = LogFormatter.formatBody(data)

        return next.handle().pipe(
            tap({
                next: (responseBody) => {
                    const duration = Date.now() - startTime

                    const logEntry: TcpLogEntry = {
                        processId,
                        transport: 'TCP',
                        timestamp: {
                            start: startTime,
                            end: Date.now()
                        },
                        duration: `${duration}ms`,
                        request: {
                            pattern,
                            data: formattedData
                        },
                        response: {
                            body: responseBody
                        }
                    }

                    if (process.env['NODE_ENV'] !== 'production') {
                        this.prettyPrint(logEntry)
                    } else {
                        this.logger.log(logEntry)
                    }
                },
                error: (error) => {
                    const duration = Date.now() - startTime

                    const logEntry: TcpLogEntry = {
                        processId,
                        transport: 'TCP',
                        timestamp: {
                            start: startTime,
                            end: Date.now()
                        },
                        duration: `${duration}ms`,
                        request: {
                            pattern,
                            data: formattedData
                        },
                        response: {
                            body: {
                                error: error?.message ?? 'Unknown error',
                                stack: process.env['NODE_ENV'] !== 'production' ? error?.stack : undefined
                            }
                        }
                    }

                    if (process.env['NODE_ENV'] !== 'production') {
                        this.prettyPrint(logEntry, true)
                    } else {
                        this.logger.error(logEntry)
                    }
                }
            })
        )
    }

    private prettyPrint(log: TcpLogEntry, isError = false) {
        const { yellow, green, magenta, gray, red } = {
            yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
            green: (s: string) => `\x1b[32m${s}\x1b[0m`,
            magenta: (s: string) => `\x1b[35m${s}\x1b[0m`,
            gray: (s: string) => `\x1b[90m${s}\x1b[0m`,
            red: (s: string) => `\x1b[31m${s}\x1b[0m`
        }

        const formatLogValue = (value: unknown): string => {
            const serialized = JSON.stringify(value, null, 2)
            if (serialized !== undefined) return serialized
            return String(value)
        }

        const header = isError ? red('⚡ TCP ERROR') : yellow('⚡ TCP LOG')

        const logMethod = isError ? Logger.error : Logger.log

        logMethod.call(
            Logger,
            `
${gray('════════════════════════════════════════')}
${header} ${gray(`[${log.processId.slice(0, 8)}]`)}
${gray('────────────────────────────────────')}
⏱️  ${gray('Duration:')} ${green(log.duration)}
📥 ${gray('Pattern:')} ${magenta(log.request.pattern)}
${gray('   Data:')}${formatLogValue(log.request.data)
                .split('\n')
                .map((l) => '   ' + l)
                .join('\n')}
📤 ${gray('Response:')} ${isError ? red('ERROR') : green('OK')}${formatLogValue(log.response.body)
                .split('\n')
                .map((l) => '   ' + l)
                .join('\n')}
${gray('════════════════════════════════════════')}
	`.trim()
        )
    }
}
