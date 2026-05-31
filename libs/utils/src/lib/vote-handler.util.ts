import { sha256 } from '@libs/ec-schnorr'
import { createHash } from 'crypto'
const VOTE_DOMAIN = 'ev-vote-v2'
const REVEAL_DOMAIN = 'reveal-v2'

/**
 * Canonical hoá danh sách ứng viên: bỏ trùng + sort lexicographic.
 *
 * Đây là quy ước DUY NHẤT phải dùng giống hệt ở client (lúc ký) và server
 * (lúc verify/hash). Nhờ sort không phụ thuộc thứ tự election nên tái lập được
 * y hệt ở mọi nền tảng (JS/TS/Go), và nếu user chọn cùng tập ứng viên theo thứ
 * tự khác nhau thì payload vẫn giống nhau ⇒ chữ ký vẫn verify đúng.
 */
export function canonicalizeCandidateIds(candidateIds: string[]): string[] {
    return [...new Set(candidateIds)].sort()
}

/**
 * Chuỗi payload canonical dùng cho cả ký, hash, và arg truyền chaincode.
 * Ví dụ: ["64f...a1","64f...c3"] (JSON, không khoảng trắng).
 */
export function canonicalCandidateIdsPayload(candidateIds: string[]): string {
    return JSON.stringify(canonicalizeCandidateIds(candidateIds))
}

/**
 * Canonical message để ký trong giao thức bầu cử.
 *
 * Bind cả `electionId` và tập `candidateIds` vào message → chữ ký Schnorr không
 * thể replay sang election khác (cross-election replay attack). Domain separator
 * ngăn collision với mọi hash khác trong hệ thống.
 *
 * Format:  SHA256("ev-vote-v2" || 0x00 || electionId || 0x00 || candidateIdsPayload)
 *
 * Cả pha blind ở client (compute h) và pha verify ở reveal-vote phải dùng
 * cùng hàm này với cùng quy ước canonical.
 */
export function buildVoteMessage(electionId: string, candidateIds: string[]): Uint8Array {
    //NOTE - Dùng sha256 của @noble/hashes để đồng bộ thư viện giữa client và server
    const enc = new TextEncoder()
    const sep = new Uint8Array([0])
    const payload = canonicalCandidateIdsPayload(candidateIds)
    const parts = [enc.encode(VOTE_DOMAIN), sep, enc.encode(electionId), sep, enc.encode(payload)]
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
//Format: SHA256("reveal-v2" || uint32be(len(payload)) || payload || h32 || sPrime32)
export function computeRevealPayloadHash(candidateIds: string[], hHex: string, sPrimeHex: string): string {
    const payload = canonicalCandidateIdsPayload(candidateIds)
    const candidateBuf = Buffer.from(payload, 'utf8')
    const lenBuf = Buffer.alloc(4)
    lenBuf.writeUInt32BE(candidateBuf.length, 0)
    return createHash('sha256')
        .update(Buffer.from(REVEAL_DOMAIN, 'utf8'))
        .update(lenBuf)
        .update(candidateBuf)
        .update(Buffer.from(hHex, 'hex'))
        .update(Buffer.from(sPrimeHex, 'hex'))
        .digest('hex')
}
