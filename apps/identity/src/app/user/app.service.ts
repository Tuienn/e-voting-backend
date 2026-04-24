import { Injectable } from '@nestjs/common'
import { CreateVoterDto } from '@libs/types/user.dto'
import { PrismaService } from '../../infrastructure/prisma.service'
import { hash } from 'argon2'
import { handlePrismaError } from '../../infrastructure/handle-prisma-error.util'

@Injectable()
export class AppService {
    constructor(private prisma: PrismaService) {}

    async createVoter(data: CreateVoterDto) {
        const hashPassword = await hash(data.password)

        try {
            return await this.prisma.user.create({
                data: {
                    email: data.email,
                    password: hashPassword,
                    name: data.name
                }
            })
        } catch (e) {
            handlePrismaError(e)
        }
    }
}
