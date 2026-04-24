import { IsDefined, IsEmail, IsString, MaxLength, MinLength } from 'class-validator'
import {
    invalidDataField,
    missingDataField,
    minLengthDataField,
    maxLengthDataField
} from '@libs/constants/text.constant'

export class SignInDto {
    @IsDefined({ message: missingDataField('email') })
    @IsEmail({}, { message: invalidDataField('email') })
    email: string

    @IsDefined({ message: missingDataField('password') })
    @MinLength(6, { message: minLengthDataField('password', 6) })
    @MaxLength(100, { message: maxLengthDataField('password', 100) })
    password: string
}

export class RefreshTokenDto {
    @IsDefined({ message: missingDataField('refreshToken') })
    @IsString({ message: invalidDataField('refreshToken') })
    refreshToken: string
}
