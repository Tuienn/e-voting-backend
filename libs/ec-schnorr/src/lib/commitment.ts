import type { EcParams, EcPoint } from './params'
import { randomScalar, scalarMultBase, pointAdd } from './utils'

export interface Commitment {
    nonce: bigint
    commitment: EcPoint
}

/**
 * Sinh commitment cho 1 signing node.
 *   k_i ∈ [1, n-1], R_i = k_i · G
 *
 * QUAN TRỌNG: k_i chỉ được dùng MỘT LẦN. Tái sử dụng → lộ khóa riêng.
 */
export function generateCommitment(params: EcParams): Commitment {
    const nonce = randomScalar(params.n)
    const commitment = scalarMultBase(nonce, params)
    return { nonce, commitment }
}

/**
 * Commitment tập thể: R_agg = Σ R_i
 */
export function computeCollectiveCommitment(commitments: EcPoint[], params: EcParams): EcPoint {
    return commitments.reduce((acc, c) => pointAdd(acc, c), params.Point.ZERO)
}
