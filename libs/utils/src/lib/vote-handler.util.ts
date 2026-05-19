import { sha256 } from '@libs/ec-schnorr'
import * as crypto from 'crypto'

const VOTE_DOMAIN = 'ev-vote-v1'
const REVEAL_DOMAIN = 'reveal-v1'

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
    //NOTE - Dùng sha256 của @noble/hashes để đồng bộ thư viện giữa client và server
    const enc = new TextEncoder()
    const sep = new Uint8Array([0])
    const parts = [enc.encode(VOTE_DOMAIN), sep, enc.encode(electionId), sep, enc.encode(candidateId)]
    const total = parts.reduce((acc, p) => acc + p.length, 0)
    const buf = new Uint8Array(total)
    let off = 0
    for (const p of parts) {
        buf.set(p, off)
        off += p.length
    }
    return sha256(buf)
}

//NOTE - Dùng crypto để tối ưu hiệu năng
export function computeRevealPayloadHash(candidateId: string, hHex: string, sPrimeHex: string): string {
    const candidateBuf = Buffer.from(candidateId, 'utf8')
    const lenBuf = Buffer.alloc(4)
    lenBuf.writeUInt32BE(candidateBuf.length, 0)
    return crypto
        .createHash('sha256')
        .update(Buffer.from(REVEAL_DOMAIN, 'utf8'))
        .update(lenBuf)
        .update(candidateBuf)
        .update(Buffer.from(hHex, 'hex'))
        .update(Buffer.from(sPrimeHex, 'hex'))
        .digest('hex')
}
