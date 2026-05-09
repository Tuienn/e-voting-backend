import type { EcParams, EcPoint } from './params'
import { randomScalar, scalarMultBase, scalarMult, pointAdd, pointToBuffer, hashToScalar, modN } from './utils'

export interface BlindResult {
    r: bigint
    alpha: bigint
    beta: bigint
    h: bigint
    Cprime: EcPoint
}

/**
 * Pha Làm mù (Blinding) — thực hiện bởi Client.
 *
 * Input:
 *   - message: Buffer/Uint8Array — thông điệp gốc
 *   - C: Point — commitment tập thể (Σ R_i)
 *   - params: { n, G, Point, ... }
 *   - P_agg: Point — khóa công khai tập thể (Σ P_i)
 *
 * Output:
 *   - r: bigint — giá trị đã làm mù, gửi cho Nodes ký
 *   - alpha, beta: bigint — bí mật giải mù (giữ lại)
 *   - h: bigint — hash value (giữ lại)
 *   - Cprime: Point — commitment đã làm mù (debug)
 *
 * Công thức:
 *   1. α, β ∈ [1, n-1]
 *   2. C' = C + α·G + β·P_agg
 *   3. h = Hash(M ‖ C') mod n
 *   4. r = (h - β) mod n
 */
export function blind(message: Uint8Array, C: EcPoint, params: EcParams, P_agg: EcPoint): BlindResult {
    const { n } = params
    const alpha = randomScalar(n)
    const beta = randomScalar(n)

    const aG = scalarMultBase(alpha, params)
    const bP = scalarMult(P_agg, beta)
    const Cprime = pointAdd(pointAdd(C, aG), bP)

    const h = hashToScalar([message, pointToBuffer(Cprime)], n)
    const r = modN(h - beta, n)

    return { r, alpha, beta, h, Cprime }
}
