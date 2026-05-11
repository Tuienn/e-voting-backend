import { invalidDataField, missingDataField } from '@libs/constants/text.constant'
import { IsDefined, IsHexadecimal, IsMongoId, IsUUID } from 'class-validator'

export class SessionIdDto {
    @IsDefined({ message: missingDataField('sessionId') })
    @IsUUID(4, { message: invalidDataField('sessionId', 'uuid') })
    sessionId: string
}

export class ElectionIdDto {
    @IsDefined({ message: missingDataField('electionId') })
    @IsMongoId({ message: invalidDataField('electionId', 'MongoDB ObjectId') })
    electionId: string
}

export class SignPartialDto extends SessionIdDto {
    @IsDefined({ message: missingDataField('rHex') })
    @IsHexadecimal({ message: invalidDataField('rHex', 'hexadecimal') })
    rHex: string

    @IsDefined({ message: missingDataField('electionId') })
    @IsMongoId({ message: invalidDataField('electionId', 'MongoDB ObjectId') })
    electionId: string

    @IsDefined({ message: missingDataField('voterId') })
    @IsMongoId({ message: invalidDataField('voterId', 'MongoDB ObjectId') })
    voterId: string
}
