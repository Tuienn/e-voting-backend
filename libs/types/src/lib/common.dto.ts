import { invalidDataField, missingDataField } from '@libs/constants/text.constant'
import { IsDefined, IsInt, IsMongoId, IsOptional, Max, Min } from 'class-validator'
import { Type } from 'class-transformer'

export class MongoIdDto {
    @IsDefined({ message: missingDataField('ID') })
    @IsMongoId({ message: invalidDataField('ID', 'MongoDB ObjectId') })
    id: string
}

export class PaginationQueryDto {
    @IsOptional()
    @Type(() => Number) // Chuyển đổi query string sang number
    @IsInt({ message: 'Page must be an integer' })
    @Min(0, { message: 'Page must be a non-negative integer' })
    page?: number

    @IsOptional()
    @Type(() => Number) // Chuyển đổi query string sang number
    @IsInt({ message: 'Page size must be an integer' })
    @Min(0, { message: 'Page size must be a non-negative integer' })
    @Max(100, { message: 'Page size must be at most 100' })
    pageSize?: number
}
