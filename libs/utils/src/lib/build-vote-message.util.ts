import { sha256 } from '@noble/hashes/sha2.js'

const DOMAIN = 'ev-vote-v1'

/**
 * Canonical message để ký trong giao thức bầu cử.
 *
 * Bind cả `electionId` và `candidateId` vào message → chữ ký Schnorr không thể
 * replay sang election khác (cross-election replay attack). Domain separator
 * ngăn collision với mọi hash khác trong hệ thống.
 *
 * Format:  SHA256("ev-vote-v1" || 0x00 || electionId || 0x00 || candidateId)
 *
 * Cả pha blind ở client (compute h) và pha verify ở reveal-vote phải dùng
 * cùng hàm này.
 */
export function buildVoteMessage(electionId: string, candidateId: string): Uint8Array {
    const enc = new TextEncoder()
    const sep = new Uint8Array([0])
    const parts = [enc.encode(DOMAIN), sep, enc.encode(electionId), sep, enc.encode(candidateId)]
    const total = parts.reduce((acc, p) => acc + p.length, 0)
    const buf = new Uint8Array(total)
    let off = 0
    for (const p of parts) {
        buf.set(p, off)
        off += p.length
    }
    return sha256(buf)
}
