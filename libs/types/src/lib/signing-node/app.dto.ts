import { invalidDataField, missingDataField } from '@libs/constants/text.constant'
import { IsDefined, IsHexadecimal, IsUUID } from 'class-validator'

export class SessionIdDto {
    @IsDefined({ message: missingDataField('sessionId') })
    @IsUUID(4, { message: invalidDataField('sessionId', 'uuid') })
    sessionId: string
}

export class SignPartialDto extends SessionIdDto {
    @IsDefined({ message: missingDataField('rHex') })
    @IsHexadecimal({ message: invalidDataField('rHex', 'hexadecimal') })
    rHex: string
}
