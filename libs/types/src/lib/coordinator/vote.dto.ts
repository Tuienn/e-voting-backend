import { GetVoterInElectionDto } from './election.dto'
import { SignPartialDto } from '../signing-node/app.dto'
import { IsDefined, IsHexadecimal, IsUUID } from 'class-validator'
import { invalidDataField, missingDataField } from '@libs/constants/text.constant'

export class StartSessionDto extends GetVoterInElectionDto {}

export class SignBlindedVoteDto extends SignPartialDto {}

export class SubmitUnblindedVoteDto extends GetVoterInElectionDto {
    @IsDefined({ message: missingDataField('sessionId') })
    @IsUUID(4, { message: invalidDataField('sessionId', 'uuid') })
    sessionId: string

    @IsDefined({ message: missingDataField('bindedVoteHash') })
    @IsHexadecimal({ message: invalidDataField('bindedVoteHash', 'hexadecimal') })
    bindedVoteHash: string

    @IsDefined({ message: missingDataField('signatureHex') })
    @IsHexadecimal({ message: invalidDataField('signatureHex', 'hexadecimal') })
    signatureHex: string
}
