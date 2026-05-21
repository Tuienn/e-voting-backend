import { GetVoterInElectionDto } from './election.dto'
import { IsDateString, IsDefined, IsEmail, IsHexadecimal, IsMongoId, IsOptional, IsUUID, Length } from 'class-validator'
import { invalidDataField, missingDataField } from '@libs/constants/text.constant'
import { MongoIdDto, PaginationQueryDto } from '../common.dto'
import { OmitType } from '@nestjs/swagger'

export class StartSessionDto extends GetVoterInElectionDto {}

export class SignBlindedVoteDto {
    @IsDefined({ message: missingDataField('sessionId') })
    @IsUUID(4, { message: invalidDataField('sessionId', 'uuid') })
    sessionId: string

    @IsDefined({ message: missingDataField('rHex') })
    @IsHexadecimal({ message: invalidDataField('rHex', 'hexadecimal') })
    rHex: string

    @IsDefined({ message: missingDataField('voterId') })
    @IsMongoId({ message: invalidDataField('voterId', 'MongoId ObjectID') })
    voterId: string
}

export class SubmitBlindedCommitmentDto extends GetVoterInElectionDto {
    @IsDefined({ message: missingDataField('sessionId') })
    @IsUUID(4, { message: invalidDataField('sessionId', 'uuid') })
    sessionId: string

    @IsDefined({ message: missingDataField('blindedCommitment') })
    @IsHexadecimal({ message: invalidDataField('blindedCommitment', 'hexadecimal') })
    @Length(64, 64, { message: 'Blinded commitment must be a 64-character hexadecimal string' })
    blindedCommitment: string

    @IsDefined({ message: missingDataField('signatureHex') })
    @IsHexadecimal({ message: invalidDataField('signatureHex', 'hexadecimal') })
    signatureHex: string
}

export class VerifyVoteDto extends MongoIdDto {
    @IsDefined({ message: missingDataField('electionId') })
    @IsMongoId({ message: invalidDataField('electionId', 'MongoDB ObjectId') })
    electionId: string

    @IsDefined({ message: missingDataField('blindedCommitment') })
    @IsHexadecimal({ message: invalidDataField('blindedCommitment', 'hexadecimal') })
    @Length(64, 64, { message: 'Blinded commitment must be a 64-character hexadecimal string' })
    blindedCommitment: string

    @IsDefined({ message: missingDataField('blockchainRef') })
    @IsHexadecimal({ message: invalidDataField('blockchainRef', 'hexadecimal') })
    blockchainRef: string
}

export class FilterVotesDto extends PaginationQueryDto {
    @IsOptional()
    @IsMongoId({ message: invalidDataField('voterId', 'MongoDB ObjectId') })
    voterId?: string

    @IsOptional()
    @IsDateString({ strict: true }, { message: invalidDataField('startDate', 'ISO date-time') })
    startDate?: string

    @IsOptional()
    @IsDateString({ strict: true }, { message: invalidDataField('endDate', 'ISO date-time') })
    endDate?: string

    @IsDefined({ message: missingDataField('electionId') })
    @IsMongoId({ message: invalidDataField('electionId', 'MongoDB ObjectId') })
    electionId: string
}

export class BffFilterVotesDto extends PaginationQueryDto {
    @IsOptional()
    @IsEmail({}, { message: invalidDataField('voterEmail') })
    voterEmail?: string

    @IsOptional()
    @IsDateString({ strict: true }, { message: invalidDataField('startDate', 'ISO date-time') })
    startDate?: string

    @IsOptional()
    @IsDateString({ strict: true }, { message: invalidDataField('endDate', 'ISO date-time') })
    endDate?: string

    @IsDefined({ message: missingDataField('electionId') })
    @IsMongoId({ message: invalidDataField('electionId', 'MongoDB ObjectId') })
    electionId: string
}

export class FilterVotesQueryDto extends OmitType(BffFilterVotesDto, ['electionId']) {}
export class SignBlindedVoteBodyDto extends OmitType(SignBlindedVoteDto, ['voterId']) {}
export class SubmitBlindedCommitmentBodyDto extends OmitType(SubmitBlindedCommitmentDto, ['electionId', 'voterId']) {}
export class VerifyVoteBodyDto extends OmitType(VerifyVoteDto, ['id']) {}
