import { ConflictException, HttpStatus, NotFoundException } from '@nestjs/common'
import { RpcException } from '@nestjs/microservices'
import { Prisma } from '../../generated/prisma/client'

export const handlePrismaError = (e: unknown): never => {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === 'P2025') throw new NotFoundException(`${e.meta?.modelName || 'Unknown'} - Record not found`)
        if (e.code === 'P2002')
            throw new ConflictException(`${e.meta?.modelName || 'Unknown'} - Unique constraint violated`)
    }
    throw new RpcException({
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Database operation failed'
    })
}
