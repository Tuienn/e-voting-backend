import {
    invalidDataField,
    maxLengthDataField,
    minLengthDataField,
    missingDataField
} from '@libs/constants/text.constant'
import {
    ArrayNotEmpty,
    ArrayUnique,
    IsDateString,
    IsDefined,
    IsEnum,
    IsMongoId,
    IsOptional,
    IsString,
    MaxLength,
    MinLength
} from 'class-validator'
import { PaginationQueryDto } from '../common.dto'
import { ElectionStatus } from './election.type'
import { IsMongoIdArray } from '../share-decorator/is-mongo-id-array.decorator'

export class CreateElectionDto {
    @IsDefined({ message: missingDataField('name') })
    @IsString({ message: invalidDataField('name') })
    @MinLength(3, { message: minLengthDataField('name', 3) })
    @MaxLength(100, { message: maxLengthDataField('name', 100) })
    name: string

    @IsDefined({ message: missingDataField('candidateIds') })
    @IsMongoIdArray('candidateIds')
    @ArrayNotEmpty({ message: invalidDataField('candidateIds', 'not empty array') })
    @ArrayUnique({ message: invalidDataField('candidateIds', 'unique MongoDB ObjectId') })
    candidateIds: string[]
}

export class FilterElectionsDto extends PaginationQueryDto {
    @IsOptional()
    @IsString({ message: invalidDataField('name') })
    @MinLength(2, { message: minLengthDataField('name', 2) })
    @MaxLength(100, { message: maxLengthDataField('name', 100) })
    name?: string

    @IsOptional()
    @IsEnum(['PENDING', 'ACTIVE', 'COMPLETED'], { message: invalidDataField('status', 'PENDING | ACTIVE | COMPLETED') })
    status?: ElectionStatus

    @IsOptional()
    @IsDateString({ strict: true }, { message: invalidDataField('startDate', 'ISO date-time') }) // Hỗ trợ YYYY-MM-DDTHH:mm:ss(.sss)Z hoặc +07:00
    startDate?: string

    @IsOptional()
    @IsDateString({ strict: true }, { message: invalidDataField('endDate', 'ISO date-time') }) // Hỗ trợ YYYY-MM-DDTHH:mm:ss(.sss)Z hoặc +07:00
    endDate?: string
}

export class VoterIdsDto {
    @IsDefined({ message: missingDataField('voterIds') })
    @IsMongoIdArray('voterIds')
    @ArrayNotEmpty({ message: invalidDataField('voterIds', 'not empty array') })
    @ArrayUnique({ message: invalidDataField('voterIds', 'unique MongoDB ObjectId') })
    voterIds: string[]
}

export class GetVoterInElectionDto {
    @IsDefined({ message: missingDataField('electionId') })
    @IsMongoId({ message: invalidDataField('electionId', 'MongoDB ObjectId') })
    electionId: string

    @IsDefined({ message: missingDataField('voterId') })
    @IsMongoId({ message: invalidDataField('voterId', 'MongoDB ObjectId') })
    voterId: string
}
