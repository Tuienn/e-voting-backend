export type Role = 'ADMIN' | 'VOTER' | 'CANDIDATE'

export type JwtPayload = {
    sub: string
    email: string
    role: Role
    isActive: boolean
    iat?: number //Issued At
    exp?: number //Expires At
}

export type RequestWithUser = {
    userId: string
    email: string
    role: Role
    isActive: boolean
}

export type SaveVoteSecretBackupArgs = {
    userId: string
    payload: string
}
