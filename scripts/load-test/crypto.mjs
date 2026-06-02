// Client-side EC-Schnorr blind voting crypto.
// Faithfully reproduced from libs/ec-schnorr (secp256k1) + libs/utils/vote-handler.util.
// Uses @noble/curves & @noble/hashes directly (already in node_modules) so the
// hashing/point math matches the server exactly — no nx build required.
import { secp256k1 } from '@noble/curves/secp256k1.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { randomBytes, bytesToHex } from '@noble/hashes/utils.js'

const SCALAR_BYTES = 32
const VOTE_DOMAIN = 'ev-vote-v2'

export function getParams() {
    return {
        n: secp256k1.Point.CURVE().n,
        G: secp256k1.Point.BASE,
        Point: secp256k1.Point
    }
}

function modN(a, n) {
    const r = a % n
    return r < 0n ? r + n : r
}

function bytesToBigInt(bytes) {
    let n = 0n
    for (const b of bytes) n = (n << 8n) | BigInt(b)
    return n
}

function bigIntToBytes(value, byteLen) {
    const out = new Uint8Array(byteLen)
    let v = value
    for (let i = byteLen - 1; i >= 0; i--) {
        out[i] = Number(v & 0xffn)
        v >>= 8n
    }
    return out
}

function randomScalar(n) {
    while (true) {
        const buf = randomBytes(SCALAR_BYTES + 8)
        const candidate = modN(bytesToBigInt(buf), n)
        if (candidate !== 0n) return candidate
    }
}

export function scalarToHex(scalar) {
    return bytesToHex(bigIntToBytes(scalar, SCALAR_BYTES))
}

export function hexToScalar(hex) {
    const clean = hex.startsWith('0x') ? hex.slice(2) : hex
    return BigInt('0x' + clean)
}

export function hexToPoint(hex, params) {
    return params.Point.fromHex(hex)
}

function pointToBuffer(point) {
    return point.toBytes(true)
}

function hashToScalar(buffers, n) {
    const h = sha256.create()
    for (const buf of buffers) h.update(buf)
    return modN(bytesToBigInt(h.digest()), n)
}

// SHA256("ev-vote-v2" || 0x00 || electionId || 0x00 || JSON.stringify(sorted-unique candidateIds))
export function canonicalizeCandidateIds(candidateIds) {
    return [...new Set(candidateIds)].sort()
}

export function buildVoteMessage(electionId, candidateIds) {
    const enc = new TextEncoder()
    const sep = new Uint8Array([0])
    const payload = JSON.stringify(canonicalizeCandidateIds(candidateIds))
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

// Blinding phase: C' = C + α·G + β·P ; h = H(M ‖ C') ; r = (h - β) mod n
export function blind(message, C, params, P) {
    const { n, G } = params
    const alpha = randomScalar(n)
    const beta = randomScalar(n)
    const Cprime = C.add(G.multiply(alpha)).add(P.multiply(beta))
    const h = hashToScalar([message, pointToBuffer(Cprime)], n)
    const r = modN(h - beta, n)
    return { r, alpha, beta, h, Cprime }
}

// Unblinding phase: s' = (s + α) mod n
export function unblind(s, alpha, n) {
    return modN(s + alpha, n)
}

// Local verification (same as the reveal-vote server): C_check = s'·G + h·P ; h == H(M ‖ C_check)
export function verify(message, h, sPrime, params, P) {
    const { n, G } = params
    const Ccheck = G.multiply(sPrime).add(P.multiply(h))
    const hCheck = hashToScalar([message, pointToBuffer(Ccheck)], n)
    return h === hCheck
}

// blindedCommitment submitted at vote time = SHA256(compressed C') as a 64-char hex (unique per ballot)
export function blindedCommitmentHex(Cprime) {
    return bytesToHex(sha256(pointToBuffer(Cprime)))
}
