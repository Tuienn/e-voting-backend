import type { EcParams } from './params'
import { modN } from './utils'

export interface UnblindResult {
    h: bigint
    sPrime: bigint
}

/**
 * Pha Giải mù (Unblinding) — Client.
 *
 *   s' = (s + α) mod n
 *
 * Output: chữ ký cuối cùng (h, s')
 */
export function unblind(s: bigint, alpha: bigint, h: bigint, params: EcParams): UnblindResult {
    const sPrime = modN(s + alpha, params.n)
    return { h, sPrime }
}
