export const removeUndefinedObj = <T>(obj: T): T => {
    if (Array.isArray(obj)) {
        return obj.map(removeUndefinedObj).filter((v) => v !== undefined) as unknown as T
    }

    if (obj !== null && typeof obj === 'object') {
        return Object.fromEntries(
            Object.entries(obj)
                .map(([key, value]) => [key, removeUndefinedObj(value)])
                .filter(([, value]) => value !== undefined)
        ) as T
    }

    return obj
}
