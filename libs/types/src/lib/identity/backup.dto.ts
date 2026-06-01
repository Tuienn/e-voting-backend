import { IsDefined, IsString, MaxLength } from 'class-validator'
import { invalidDataField, maxLengthDataField, missingDataField } from '@libs/constants/text.constant'

// Envelope client (đã mã hóa zero-knowledge) dạng JSON string. Server lưu mờ, không parse.
// Giới hạn 256KB để chặn payload bất thường (thực tế envelope chỉ vài KB).
const MAX_PAYLOAD_LENGTH = 256 * 1024

export class SaveVoteSecretBackupDto {
    @IsDefined({ message: missingDataField('payload') })
    @IsString({ message: invalidDataField('payload') })
    @MaxLength(MAX_PAYLOAD_LENGTH, { message: maxLengthDataField('payload', MAX_PAYLOAD_LENGTH) })
    payload: string
}
