import { IsDefined, IsEmail, MaxLength, MinLength } from 'class-validator'
import {
    invalidDataField,
    missingDataField,
    minLengthDataField,
    maxLengthDataField
} from '@libs/constants/text.constant'

export class CreateVoterDto {
    @IsDefined({ message: missingDataField('email') })
    @IsEmail({}, { message: invalidDataField('email') })
    email: string

    @IsDefined({ message: missingDataField('password') })
    @MinLength(6, { message: minLengthDataField('password', 6) })
    @MaxLength(100, { message: maxLengthDataField('password', 100) })
    password: string

    @IsDefined({ message: missingDataField('name') })
    @MinLength(2, { message: minLengthDataField('name', 2) })
    @MaxLength(100, { message: maxLengthDataField('name', 100) })
    name: string
}

export class GetUserByEmailDto {
    @IsDefined({ message: missingDataField('email') })
    @IsEmail({}, { message: invalidDataField('email') })
    email: string
}
