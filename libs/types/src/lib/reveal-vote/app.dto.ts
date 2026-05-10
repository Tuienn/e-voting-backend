import { invalidDataField, missingDataField } from '@libs/constants/text.constant'
import { IsDefined, IsHexadecimal, IsMongoId } from 'class-validator'

export class RevealVoteDto {
    @IsDefined({ message: missingDataField('candidateId') })
    @IsMongoId({ message: invalidDataField('candidate', 'MongoDB ObjectId') })
    candidateId: string

    @IsDefined({ message: missingDataField('electionId') })
    @IsMongoId({ message: invalidDataField('election', 'MongoDB ObjectId') })
    electionId: string

    @IsDefined({ message: missingDataField('h param') })
    @IsHexadecimal({ message: invalidDataField('h param', 'hexadecimal') })
    h: string

    @IsDefined({ message: missingDataField('sPrime param') })
    @IsHexadecimal({ message: invalidDataField('sPrime param', 'hexadecimal') })
    sPrime: string
}
