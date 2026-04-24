import { HttpStatus } from '@nestjs/common'
import { RpcException } from '@nestjs/microservices'
import { Prisma } from '../../generated/prisma/client'

export const handlePrismaError = (e: unknown): never => {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === 'P2025')
            throw new RpcException({
                status: HttpStatus.NOT_FOUND,
                message: `${e.meta?.modelName || 'Unknown'} - Record not found`
            })
        if (e.code === 'P2002')
            throw new RpcException({
                status: HttpStatus.CONFLICT,
                message: `${e.meta?.modelName || 'Unknown'} - Unique constraint violated`
            })
    }
    throw new RpcException({
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Database operation failed'
    })
}
