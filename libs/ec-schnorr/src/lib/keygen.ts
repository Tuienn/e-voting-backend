import type { EcParams, EcPoint } from './params'
import { randomScalar, scalarMultBase, pointAdd } from './utils'

export interface KeyPair {
    privateKey: bigint
    publicKey: EcPoint
}

/**
 * Sinh cặp khóa cho 1 signing node.
 *   d_i ∈ [1, n-1], P_i = d_i · G
 */
export function generateKeyPair(params: EcParams): KeyPair {
    const privateKey = randomScalar(params.n)
    const publicKey = scalarMultBase(privateKey, params)
    return { privateKey, publicKey }
}

/**
 * Khóa công khai tập thể: P_agg = Σ P_i
 */
export function computeCollectivePublicKey(publicKeys: EcPoint[], params: EcParams): EcPoint {
    return publicKeys.reduce((acc, pk) => pointAdd(acc, pk), params.Point.ZERO)
}
