import type { EcParams, EcPoint } from './params'
import { scalarMultBase, scalarMult, pointAdd, pointToBuffer, hashToScalar } from './utils'

/**
 * Pha Xác thực (Verify) — Verifier.
 *
 *   1. C_check = s'·G + h·P_agg
 *   2. h_check = Hash(M ‖ C_check) mod n
 *   3. Hợp lệ nếu h == h_check
 */
export function verify(message: Uint8Array, h: bigint, sPrime: bigint, params: EcParams, P_agg: EcPoint): boolean {
    const { n } = params
    const sG = scalarMultBase(sPrime, params)
    const hP = scalarMult(P_agg, h)
    const Ccheck = pointAdd(sG, hP)

    const hCheck = hashToScalar([message, pointToBuffer(Ccheck)], n)
    return h === hCheck
}
