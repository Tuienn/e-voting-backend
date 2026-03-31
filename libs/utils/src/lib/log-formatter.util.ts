interface UploadedFile {
    originalname: string
    mimetype: string
    size: number
    encoding: string
}

type UploadedFiles = UploadedFile[] | UploadedFile | Record<string, UploadedFile[] | UploadedFile>

export class LogFormatter {
    /**
     * Format request/response body theo community best practices
     * - JSON: parse và giới hạn độ sâu
     * - File: chỉ log metadata, không log content
     */
    static formatBody(body: unknown, files?: UploadedFiles): unknown {
        // Trường hợp có file upload (multipart/form-data)
        const normalizedFiles = this.normalizeUploadedFiles(files)
        if (Object.keys(normalizedFiles).length > 0) {
            const fileMeta: Record<string, Array<Record<string, string>>> = {}

            Object.entries(normalizedFiles).forEach(([fieldName, fileData]) => {
                fileMeta[fieldName] = fileData.map((file) => ({
                    originalname: file.originalname,
                    mimetype: file.mimetype,
                    size: `${(file.size / 1024).toFixed(2)} KB`,
                    encoding: file.encoding
                }))
            })

            // Nếu body không phải object, trả về object mới chứa fileMeta
            return { _files: fileMeta, _body: body }
        }

        // Trường hợp JSON body - tránh circular reference & giới hạn depth
        try {
            return this.safeStringify(body, 3) // Max depth = 3
        } catch {
            return '[Unserializable body]'
        }
    }

    private static normalizeUploadedFiles(files?: UploadedFiles): Record<string, UploadedFile[]> {
        if (!files) return {}

        if (Array.isArray(files)) {
            return files.length > 0 ? { files } : {}
        }

        if (this.isUploadedFile(files)) {
            return { file: [files] }
        }

        const normalized: Record<string, UploadedFile[]> = {}
        Object.entries(files).forEach(([fieldName, fileData]) => {
            if (Array.isArray(fileData)) {
                if (fileData.length > 0) normalized[fieldName] = fileData
                return
            }

            if (this.isUploadedFile(fileData)) {
                normalized[fieldName] = [fileData]
            }
        })

        return normalized
    }

    private static isUploadedFile(value: unknown): value is UploadedFile {
        if (!value || typeof value !== 'object') return false

        const candidate = value as Partial<UploadedFile>
        return (
            typeof candidate.originalname === 'string' &&
            typeof candidate.mimetype === 'string' &&
            typeof candidate.size === 'number' &&
            typeof candidate.encoding === 'string'
        )
    }

    private static safeStringify(
        obj: unknown,
        maxDepth: number,
        currentDepth = 0,
        seen = new WeakSet<object>()
    ): unknown {
        if (currentDepth >= maxDepth) return '[Max depth reached]'
        if (obj === null || typeof obj !== 'object') return obj

        if (seen.has(obj)) return '[Circular]'
        seen.add(obj)

        if (Array.isArray(obj)) {
            return obj.slice(0, 10).map((item) => this.safeStringify(item, maxDepth, currentDepth + 1, seen))
        }

        const result: Record<string, unknown> = {}
        Object.keys(obj)
            .slice(0, 20)
            .forEach((key) => {
                // Giới hạn số field
                result[key] = this.safeStringify(
                    (obj as Record<string, unknown>)[key],
                    maxDepth,
                    currentDepth + 1,
                    seen
                )
            })
        return result
    }
}
