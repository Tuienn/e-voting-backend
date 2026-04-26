import { BadRequestException, ConflictException, HttpStatus, NotFoundException } from '@nestjs/common'

type PrismaKnownRequestErrorLike = {
    name?: string
    code: string
    meta?: {
        modelName?: string
    }
}

const isPrismaKnownRequestError = (error: unknown): error is PrismaKnownRequestErrorLike => {
    if (!error || typeof error !== 'object') return false

    const maybeError = error as { name?: unknown; code?: unknown }
    return maybeError.name === 'PrismaClientKnownRequestError' && typeof maybeError.code === 'string'
}

export const handlePrismaError = (e: unknown): never => {
    if (isPrismaKnownRequestError(e)) {
        const modelName = e.meta?.modelName ?? 'Unknown'

        if (e.code === 'P2025') throw new NotFoundException(`${modelName} - Record not found`)
        if (e.code === 'P2002') throw new ConflictException(`${modelName} - Unique constraint violated`)
    }

    throw new BadRequestException({
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Database operation failed'
    })
}
