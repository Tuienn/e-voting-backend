import { readFileSync } from 'fs'
import type { ConnectionOptions, TlsOptions } from 'tls'

/**
 * mTLS dùng chung cho mọi internal service.
 *
 * Bật/tắt toàn cục bằng env MTLS_ENABLED. Khi != 'true' => tất cả helper trả về
 * undefined, NestJS (TCP)/ioredis/node-redis tự fallback về kết nối thường
 * (an toàn cho dev local, không cần cert).
 *
 * Mỗi service trỏ tới cert ĐỊNH DANH RIÊNG của nó qua 3 biến env:
 *   TLS_CA_PATH   - CA nội bộ dùng chung (trust anchor cho cả mesh)
 *   TLS_CERT_PATH - cert của service (đã được CA ký)
 *   TLS_KEY_PATH  - private key tương ứng
 *
 * Cùng một cert được dùng cho cả 3 vai: TCP server, TCP client, Redis client.
 */

const isMtlsEnabled = (): boolean => process.env['MTLS_ENABLED'] === 'true'

const readMaterial = (): { ca: Buffer; cert: Buffer; key: Buffer } => {
    const caPath = process.env['TLS_CA_PATH']
    const certPath = process.env['TLS_CERT_PATH']
    const keyPath = process.env['TLS_KEY_PATH']

    if (!caPath || !certPath || !keyPath) {
        throw new Error('MTLS_ENABLED=true nhưng thiếu TLS_CA_PATH / TLS_CERT_PATH / TLS_KEY_PATH')
    }

    return {
        ca: readFileSync(caPath),
        cert: readFileSync(certPath),
        key: readFileSync(keyPath)
    }
}

/**
 * Dùng cho TCP microservice server (NestJS Transport.TCP).
 * requestCert + rejectUnauthorized chính là phần "mutual": server yêu cầu client
 * xuất trình cert và từ chối nếu cert không do CA của mình ký.
 */
export const getServerTlsOptions = (): TlsOptions | undefined => {
    if (!isMtlsEnabled()) return undefined

    return {
        ...readMaterial(),
        requestCert: true,
        rejectUnauthorized: true
    }
}

/**
 * Dùng cho TCP client (NestJS ClientProxy TCP).
 * servername = tên trong SAN của server cần verify (chỉ cần truyền khi host khác SAN,
 * ví dụ host là IP; nếu host đã là DNS name khớp SAN thì để trống cũng được).
 */
export const getClientTlsOptions = (servername?: string): ConnectionOptions | undefined => {
    if (!isMtlsEnabled()) return undefined

    return {
        ...readMaterial(),
        rejectUnauthorized: true,
        ...(servername ? { servername } : {})
    }
}

/**
 * Dùng cho Redis.
 * - ioredis (NestJS Transport.REDIS, event bus): gán trực tiếp vào option `tls`.
 * - node-redis (@keyv/redis cache): spread vào `socket` kèm `tls: true`.
 */
export const getRedisTlsOptions = (): ConnectionOptions | undefined => {
    if (!isMtlsEnabled()) return undefined

    return {
        ...readMaterial(),
        rejectUnauthorized: true
    }
}
