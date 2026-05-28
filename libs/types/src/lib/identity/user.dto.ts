import { ROLE_ARRAY } from '@libs/constants/common.constant'
import {
    IsArray,
    IsBoolean,
    IsDefined,
    IsEmail,
    IsEnum,
    IsOptional,
    MaxLength,
    MinLength,
    NotEquals,
    ValidateNested
} from 'class-validator'
import {
    invalidDataField,
    missingDataField,
    minLengthDataField,
    maxLengthDataField,
    invalidDataFieldInArray
} from '@libs/constants/text.constant'
import { PaginationQueryDto } from '../common.dto'
import { Transform, Type } from 'class-transformer'
import { Role } from './auth.type'
import {} from '@nestjs/swagger'

export class CreateUserDto {
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

    @IsOptional()
    @IsEnum(ROLE_ARRAY, { message: invalidDataField('role', 'VOTER | CANDIDATE | ADMIN') })
    @NotEquals('ADMIN', { message: 'Cannot create user with role ADMIN' })
    role?: string
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

    @IsOptional()
    @IsEnum(ROLE_ARRAY, { message: invalidDataField('role', 'VOTER | CANDIDATE | ADMIN') })
    role?: string
}

export class CreateBulkUsersDto {
    @IsDefined({ message: missingDataField('data') })
    @IsArray({ message: invalidDataField('data', 'array of User') })
    @ValidateNested({ each: true, message: invalidDataFieldInArray('data', 'User') })
    @Type(() => CreateUserDto)
    data: CreateUserDto[]
}

export class RoleDto {
    @IsOptional()
    @IsEnum(ROLE_ARRAY, { message: invalidDataField('role', 'VOTER | CANDIDATE | ADMIN') })
    role?: Role
}
