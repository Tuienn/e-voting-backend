import { GetVoterInElectionDto } from './election.dto'
import { IsDefined, IsHexadecimal, IsMongoId, IsUUID } from 'class-validator'
import { invalidDataField, missingDataField } from '@libs/constants/text.constant'

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
    blindedCommitment: string

    @IsDefined({ message: missingDataField('signatureHex') })
    @IsHexadecimal({ message: invalidDataField('signatureHex', 'hexadecimal') })
    signatureHex: string
}
