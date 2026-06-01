import { Global, Module } from '@nestjs/common'
import { WinstonModule, utilities as nestWinstonModuleUtilities } from 'nest-winston'
import * as winston from 'winston'
import DailyRotateFile from 'winston-daily-rotate-file'

const isProd = process.env['NODE_ENV'] === 'production'

const dailyRotateFileFormat = winston.format.combine(winston.format.timestamp(), winston.format.json())

const prodTransports: winston.transport[] = [
    new winston.transports.Console({
        format: winston.format.combine(winston.format.timestamp(), winston.format.json())
    }),
    new DailyRotateFile({
        filename: 'logs/%DATE%-combined.log',
        datePattern: 'YYYY-MM-DD',
        zippedArchive: true,
        maxSize: '20m',
        maxFiles: '14d',
        format: dailyRotateFileFormat
    }),
    new DailyRotateFile({
        filename: 'logs/%DATE%-error.log',
        datePattern: 'YYYY-MM-DD',
        level: 'error',
        zippedArchive: true,
        maxSize: '20m',
        maxFiles: '30d',
        format: dailyRotateFileFormat
    })
]

const devTransports: winston.transport[] = [
    new winston.transports.Console({
        format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.ms(),
            nestWinstonModuleUtilities.format.nestLike('App', { colors: true, prettyPrint: true })
        )
    })
]

@Global()
@Module({
    imports: [
        WinstonModule.forRoot({
            defaultMeta: { service: process.env['SERVICE_NAME'] || 'unknown-service' },
            transports: isProd ? prodTransports : devTransports
        })
    ],
    exports: [WinstonModule]
})
export class WinstonLoggerModule {}
