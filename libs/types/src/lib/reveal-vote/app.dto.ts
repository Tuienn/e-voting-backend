import { invalidDataField, missingDataField } from '@libs/constants/text.constant'
import { OmitType } from '@nestjs/swagger'
import { ArrayNotEmpty, ArrayUnique, IsDefined, IsHexadecimal, IsMongoId } from 'class-validator'
import { IsMongoIdArray } from '../share-decorator/is-mongo-id-array.decorator'

export class RevealVoteDto {
    @IsDefined({ message: missingDataField('candidateIds') })
    @IsMongoIdArray('candidateIds')
    @ArrayNotEmpty({ message: invalidDataField('candidateIds', 'not empty array') })
    @ArrayUnique({ message: invalidDataField('candidateIds', 'unique MongoDB ObjectId') })
    candidateIds: string[]

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

export class RevealVoteBodyDto extends OmitType(RevealVoteDto, ['electionId']) {}
