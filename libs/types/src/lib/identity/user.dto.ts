import { IsBoolean, IsDefined, IsEmail, IsOptional, MaxLength, MinLength } from 'class-validator'
import {
    invalidDataField,
    missingDataField,
    minLengthDataField,
    maxLengthDataField
} from '@libs/constants/text.constant'
import { PaginationQueryDto } from '../common.dto'
import { Transform } from 'class-transformer'

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

export class UpdateUserByIdDto {
    @IsOptional()
    @IsEmail({}, { message: invalidDataField('email') })
    email?: string

    @IsOptional()
    @MinLength(2, { message: minLengthDataField('name', 2) })
    @MaxLength(100, { message: maxLengthDataField('name', 100) })
    name?: string
}

export class FilterUsersDto extends PaginationQueryDto {
    @IsOptional()
    @IsEmail({}, { message: invalidDataField('email') })
    email?: string

    @IsOptional()
    @MinLength(2, { message: minLengthDataField('name', 2) })
    @MaxLength(100, { message: maxLengthDataField('name', 100) })
    name?: string

    @IsOptional()
    @Transform(({ value }) => {
        if (value === 'true' || value === true) return true
        if (value === 'false' || value === false) return false
        return value
    })
    @IsBoolean({ message: invalidDataField('isActive', 'boolean(true/false)') })
    isActive?: boolean
}
