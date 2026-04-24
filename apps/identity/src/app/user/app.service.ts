import { Injectable } from '@nestjs/common'
import { CreateVoterDto, GetUserByEmailDto } from '@libs/types/identity/user.dto'
import { PrismaService } from '../../infrastructure/prisma/prisma.service'
import { hash } from 'argon2'
import { handlePrismaError } from '../../infrastructure/handle-prisma-error.util'

@Injectable()
export class AppService {
    constructor(private prisma: PrismaService) {}

    async createVoter(dto: CreateVoterDto) {
        const hashPassword = await hash(dto.password)

        try {
            return await this.prisma.user.create({
                data: {
                    email: dto.email,
                    password: hashPassword,
                    name: dto.name
                }
            })
        } catch (e) {
            handlePrismaError(e)
        }
    }

    async getUserByEmail(dto: GetUserByEmailDto) {
        return await this.prisma.user.findUnique({
            where: {
                email: dto.email
            }
        })
    }
}
