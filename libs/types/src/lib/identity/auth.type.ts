export type Role = 'ADMIN' | 'VOTER'

export type JwtPayload = {
    sub: string
    email: string
    role: Role
}

export type UserPayload = {
    userId: number
    email: string
    role: Role
}

export type RequestWithUser = UserPayload
