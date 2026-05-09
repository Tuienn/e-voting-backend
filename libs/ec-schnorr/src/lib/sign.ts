import type { EcParams } from './params'
import { modN } from './utils'

/**
 * Pha Ký (Signing) — thực hiện bởi mỗi Signing Node.
 *
 *   s_i = (k_i - d_i · r) mod n
 */
export function signPartial(ki: bigint, di: bigint, r: bigint, params: EcParams): bigint {
    return modN(ki - di * r, params.n)
}

/**
 * Tổng hợp chữ ký partial — Coordinator.
 *
 *   s = Σ s_i mod n
 */
export function aggregateSignatures(partialSigs: bigint[], params: EcParams): bigint {
    return partialSigs.reduce((acc, si) => modN(acc + si, params.n), 0n)
}
