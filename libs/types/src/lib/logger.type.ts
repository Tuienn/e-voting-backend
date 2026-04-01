export type UploadedFileLog = {
    originalname: string
    mimetype: string
    size: number
    encoding: string
}

export type UploadedFilesLog = UploadedFileLog[] | UploadedFileLog | Record<string, UploadedFileLog[] | UploadedFileLog>
