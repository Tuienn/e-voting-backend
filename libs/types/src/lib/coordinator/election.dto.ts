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
    IsInt,
    IsMongoId,
    IsOptional,
    IsString,
    MaxLength,
    Min,
    MinLength
} from 'class-validator'
import { PaginationQueryDto } from '../common.dto'
import { ElectionStatus } from './election.type'
import { IsMongoIdArray } from '../share-decorator/is-mongo-id-array.decorator'
import { OmitType } from '@nestjs/swagger'

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

    //NOTE - Số ứng viên tối đa được chọn mỗi lá phiếu. Default 1; service validate <= candidateIds.length
    @IsOptional()
    @IsInt({ message: invalidDataField('maxSelectableCandidates', 'integer') })
    @Min(1, { message: invalidDataField('maxSelectableCandidates', 'integer >= 1') })
    maxSelectableCandidates?: number
}

export class FilterElectionsDto extends PaginationQueryDto {
    @IsOptional()
    @IsString({ message: invalidDataField('name') })
    @MinLength(2, { message: minLengthDataField('name', 2) })
    @MaxLength(100, { message: maxLengthDataField('name', 100) })
    name?: string

    @IsOptional()
    @IsEnum(['PENDING', 'ACTIVE', 'CLOSED', 'COMPLETED'], {
        message: invalidDataField('status', 'PENDING | ACTIVE | CLOSED | COMPLETED')
    })
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

export class CandidateIdsDto {
    @IsDefined({ message: missingDataField('candidateIds') })
    @IsMongoIdArray('candidateIds')
    @ArrayNotEmpty({ message: invalidDataField('candidateIds', 'not empty array') })
    @ArrayUnique({ message: invalidDataField('candidateIds', 'unique MongoDB ObjectId') })
    candidateIds: string[]
}

export class GetVoterInElectionDto {
    @IsDefined({ message: missingDataField('electionId') })
    @IsMongoId({ message: invalidDataField('electionId', 'MongoDB ObjectId') })
    electionId: string

    @IsDefined({ message: missingDataField('voterId') })
    @IsMongoId({ message: invalidDataField('voterId', 'MongoDB ObjectId') })
    voterId: string
}

export class GetMyElectionAllInfoDto extends GetVoterInElectionDto {}

export class GetElectionsByUserIdDto {
    @IsDefined({ message: missingDataField('userId') })
    @IsMongoId({ message: invalidDataField('userId', 'MongoDB ObjectId') })
    userId: string

    @IsOptional()
    @IsEnum(['PENDING', 'ACTIVE', 'CLOSED', 'COMPLETED'], {
        message: invalidDataField('status', 'PENDING | ACTIVE | CLOSED | COMPLETED')
    })
    status?: ElectionStatus
}

export class GetElectionsByUserIdQueryDto extends OmitType(GetElectionsByUserIdDto, ['userId']) {}
