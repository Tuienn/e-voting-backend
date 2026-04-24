export const AUTH_TEXT = {
    INVALID_ACCESS_TOKEN: 'Invalid or expired access token',
    ACCESS_TOKEN_REQUIRED: 'Access token is required',
    INVALID_REFRESH_TOKEN: 'Invalid or expired refresh token',
    USER_NOT_FOUND: 'User not found',
    ACCOUNT_DISABLED: 'Account has been disabled',
    INVALID_CREDENTIALS: 'Invalid email or password'
}

export const missingDataField = (field: string) => `${field.charAt(0).toUpperCase() + field.slice(1)} is required`

export const invalidDataField = (field: string, fieldType?: string) =>
    `${field.charAt(0).toUpperCase() + field.slice(1)} ${fieldType ? `must be in ${fieldType} format` : 'is invalid'}`

export const existedDataField = (field: string) => `${field.charAt(0).toUpperCase() + field.slice(1)} already exists`

export const minLengthDataField = (field: string, min: number) =>
    `${field.charAt(0).toUpperCase() + field.slice(1)} must be at least ${min} characters long`

export const maxLengthDataField = (field: string, max: number) =>
    `${field.charAt(0).toUpperCase() + field.slice(1)} must be at most ${max} characters long`

export const rangeLengthDataField = (field: string, min: number, max: number) =>
    `${field.charAt(0).toUpperCase() + field.slice(1)} must be between ${min} and ${max} characters long`

export const enumDataField = (field: string, values: string[]) =>
    `${field.charAt(0).toUpperCase() + field.slice(1)} must be one of the following values: ${values.join(', ')}`
