// E-Voting load / integration test harness.
//
// Runs the full flow over real HTTP: admin login -> create voters/candidates ->
// create election -> add voters -> start -> (each voter) blind vote -> close ->
// reveal -> tally. The blind-voting crypto is faithfully reproduced in crypto.mjs.
//
// Requires: the 7 services running with the TEST env (see serve-test.sh) plus
// MongoDB/Redis and a reachable Fabric/Chainlaunch.
//
// Usage:
//   node scripts/load-test/run.mjs --voters 10
//   node scripts/load-test/run.mjs --voters 100  --concurrency 25 --max 1
//   node scripts/load-test/run.mjs --voters 1000 --concurrency 30 --no-reveal
//
//   # Spread ballots over time like a real election (random think-time per voter):
//   node scripts/load-test/run.mjs --voters 200 --vote-delay-min 0 --vote-delay-max 5000 \
//        --reveal-delay-min 0 --reveal-delay-max 10000
//
// Flags:
//   --voters N            number of voters (default 10)
//   --candidates N        number of candidates (default 3)
//   --max N               maxSelectableCandidates (default 1)
//   --concurrency N       parallel requests in the vote/reveal phases (default 20)
//   --no-reveal           stop after submitting votes, skip reveal (measure vote phase alone)
//   --negative            run integrity/negative tests (double-vote, forged signature,
//                         vote-after-close, double-reveal must all be REJECTED). Adds 2
//                         reserved voters; reveal phase then measures N-1 ballots.
//   --vote-delay-min MS   min random delay before each ballot's vote flow (default 0)
//   --vote-delay-max MS   max random delay before each ballot's vote flow (default 0)
//   --reveal-delay-min MS min random delay before each reveal (default 0)
//   --reveal-delay-max MS max random delay before each reveal (default 0)
//   --request-timeout MS  per-HTTP-request timeout (default 30000)
//
// The random delays simulate realistic voter arrival; they are applied BEFORE the
// timed section, so latency stats (p50/p95/...) reflect pure request time, while
// the wall-clock / throughput reflects the simulated arrival pattern.

import {
    getParams,
    hexToPoint,
    hexToScalar,
    scalarToHex,
    blind,
    unblind,
    verify,
    buildVoteMessage,
    canonicalizeCandidateIds,
    blindedCommitmentHex
} from './crypto.mjs'

// ---------- configuration ----------
const BFF = process.env.BFF_BASE_URL ?? 'http://localhost:3001/api/v1'
const REVEAL = process.env.REVEAL_BASE_URL ?? 'http://localhost:3007/api/v1'
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@example.com'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? '12345678'
const VOTER_PASSWORD = 'password123'

function arg(name, def) {
    const i = process.argv.indexOf(`--${name}`)
    if (i === -1) return def
    const v = process.argv[i + 1]
    return v && !v.startsWith('--') ? v : true
}
const hasFlag = (name) => process.argv.includes(`--${name}`)

const N_VOTERS = Number(arg('voters', 10))
const N_CANDIDATES = Number(arg('candidates', 3))
const MAX_SELECT = Number(arg('max', 1))
const CONCURRENCY = Number(arg('concurrency', 20))
const DO_REVEAL = !hasFlag('no-reveal')
const VOTE_DELAY_MIN = Number(arg('vote-delay-min', 0))
const VOTE_DELAY_MAX = Number(arg('vote-delay-max', 0))
const REVEAL_DELAY_MIN = Number(arg('reveal-delay-min', 0))
const REVEAL_DELAY_MAX = Number(arg('reveal-delay-max', 0))
const REQUEST_TIMEOUT = Number(arg('request-timeout', 30000))
// users/batch for create-bulk-users. argon2 (~55ms/user, sequential) under a 5s server
// timeout caps this at ~80; 20 stays safe even with a cold-start spike on the first batch.
const USER_CREATE_BATCH = Number(arg('user-create-batch', 20))
const ADD_VOTERS_BATCH = Number(arg('add-voters-batch', 200))
// integrity/negative tests: assert the system REJECTS double-vote, forged signatures,
// vote-after-close and double-reveal under load. Needs 2 extra "reserved" voters that
// are added to the election but never cast a counted ballot.
const DO_NEGATIVE = hasFlag('negative')
const NEG_VOTERS = DO_NEGATIVE ? 2 : 0
const RUN_ID = `lt${Date.now().toString(36)}`

const params = getParams()

// ---------- helpers ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
// inclusive random integer in [min, max]; returns 0 when both are 0
function randInt(min, max) {
    if (max <= min) return Math.max(0, min)
    return min + Math.floor(Math.random() * (max - min + 1))
}

async function http(base, method, path, { token, body, headers } = {}) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT)
    try {
        const res = await fetch(base + path, {
            method,
            headers: {
                'content-type': 'application/json',
                ...(token ? { authorization: `Bearer ${token}` } : {}),
                ...headers
            },
            body: body ? JSON.stringify(body) : undefined,
            signal: ctrl.signal
        })
        const text = await res.text()
        let json
        try {
            json = text ? JSON.parse(text) : null
        } catch {
            json = text
        }
        if (!res.ok) {
            const msg = json?.message ?? json?.error ?? text
            const err = new Error(`${method} ${path} -> ${res.status}: ${JSON.stringify(msg)}`)
            err.status = res.status // negative tests assert on the HTTP status
            throw err
        }
        // ResponseDto wraps the payload in .data
        return json?.data ?? json
    } catch (e) {
        if (e.name === 'AbortError') {
            const err = new Error(`${method} ${path} -> request timeout after ${REQUEST_TIMEOUT}ms`)
            err.status = 'timeout'
            throw err
        }
        throw e
    } finally {
        clearTimeout(timer)
    }
}

// bounded-concurrency pool. An optional delayFn(item, idx) returns a number of ms to
// sleep BEFORE the timed work, so think-time is excluded from latency stats.
async function pool(items, limit, worker, { delayFn } = {}) {
    const durations = []
    const errors = []
    let idx = 0
    let ok = 0
    async function runner() {
        while (idx < items.length) {
            const myIdx = idx++
            if (delayFn) {
                const d = delayFn(items[myIdx], myIdx)
                if (d > 0) await sleep(d)
            }
            const t0 = performance.now()
            try {
                await worker(items[myIdx], myIdx)
                durations.push(performance.now() - t0)
                ok++
            } catch (e) {
                if (errors.length < 5) errors.push(e.message)
            }
        }
    }
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runner))
    return { ok, fail: items.length - ok, durations, errors }
}

function stats(durations) {
    if (!durations.length) return { p50: 0, p95: 0, avg: 0, max: 0 }
    const s = [...durations].sort((a, b) => a - b)
    const q = (p) => s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]
    return {
        p50: q(50),
        p95: q(95),
        avg: durations.reduce((a, b) => a + b, 0) / durations.length,
        max: s[s.length - 1]
    }
}
const ms = (n) => `${n.toFixed(0)}ms`

function logStage(name, t0) {
    console.log(`  ok ${name} (${ms(performance.now() - t0)})`)
}

// run fn(), push its wall time (ms) into `arr`, and return fn()'s result. Used to
// time each sub-step of the vote flow separately so the real bottleneck is visible.
async function timed(arr, fn) {
    const t0 = performance.now()
    const out = await fn()
    arr.push(performance.now() - t0)
    return out
}

async function signIn(email) {
    const res = await http(BFF, 'POST', '/identity/auth/sign-in', { body: { email, password: VOTER_PASSWORD } })
    return res.accessToken
}

// derive a structurally-valid-but-WRONG scalar hex (passes isValidScalarHex on the
// server, so the request reaches the integrity check we actually want to exercise).
function bumpScalarHex(hex) {
    let v = (hexToScalar(hex) + 1n) % params.n
    if (v === 0n) v = 1n
    return scalarToHex(v)
}

// ---------- integrity / negative tests ----------
// Each check runs an operation that MUST be rejected, and records whether the system
// rejected it with the expected status / message. They never create a counted ballot.
const negResults = []
async function expectReject(label, expected, fn) {
    try {
        await fn()
        negResults.push({ label, passed: false, got: 'ACCEPTED — expected rejection' })
    } catch (e) {
        const statusOk = expected.status == null || e.status === expected.status
        const msgOk =
            !expected.msgIncludes ||
            String(e.message ?? '')
                .toLowerCase()
                .includes(expected.msgIncludes.toLowerCase())
        negResults.push({
            label,
            passed: statusOk && msgOk,
            got: `${e.status ?? '?'} ${String(e.message ?? '')
                .split('->')
                .pop()
                ?.trim()}`
        })
    }
}

function reportNegatives() {
    if (!negResults.length) return
    console.log(`\n  === INTEGRITY / NEGATIVE TESTS ===`)
    for (const r of negResults) {
        console.log(`    ${r.passed ? 'PASS' : 'FAIL'}  ${r.label.padEnd(34)} -> ${r.got}`)
    }
    const pass = negResults.filter((r) => r.passed).length
    console.log(`  [NEGATIVE] ${pass}/${negResults.length} integrity checks passed`)
}

const SUB_STEPS = [
    ['sign-in', 'signin'],
    ['start-session', 'session'],
    ['sign (threshold)', 'sign'],
    ['submit (chain)', 'submit']
]
function reportSubSteps(stepDurations) {
    console.log(`  [VOTE sub-steps] per successful ballot (latency, ms — pinpoints the real bottleneck):`)
    for (const [label, key] of SUB_STEPS) {
        const st = stats(stepDurations[key])
        console.log(
            `    ${label.padEnd(18)} p50=${ms(st.p50)} p95=${ms(st.p95)} avg=${ms(st.avg)} max=${ms(st.max)} (n=${stepDurations[key].length})`
        )
    }
}

// ---------- flow ----------
async function main() {
    console.log(
        `\n=== LOAD TEST run=${RUN_ID} voters=${N_VOTERS} candidates=${N_CANDIDATES} max=${MAX_SELECT} ` +
            `concurrency=${CONCURRENCY} reveal=${DO_REVEAL} ===`
    )
    console.log(
        `    vote-delay=[${VOTE_DELAY_MIN},${VOTE_DELAY_MAX}]ms  reveal-delay=[${REVEAL_DELAY_MIN},${REVEAL_DELAY_MAX}]ms  ` +
            `request-timeout=${REQUEST_TIMEOUT}ms\n`
    )
    const grandStart = performance.now()

    // 1. Admin login
    let t = performance.now()
    const admin = await http(BFF, 'POST', '/identity/auth/sign-in', {
        body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD }
    })
    const adminToken = admin.accessToken
    logStage('admin sign-in', t)

    // 2. Create users (candidates + voters) in bulk
    t = performance.now()
    const candEmails = Array.from({ length: N_CANDIDATES }, (_, i) => `${RUN_ID}_cand${i}@test.local`)
    const voterEmails = Array.from({ length: N_VOTERS }, (_, i) => `${RUN_ID}_voter${i}@test.local`)
    // reserved voters: added to the election but never cast a counted ballot, used only
    // by the integrity tests (forged-submit / vote-after-close) so the tally stays clean.
    const negEmails = Array.from({ length: NEG_VOTERS }, (_, i) => `${RUN_ID}_neg${i}@test.local`)
    const candData = candEmails.map((email, i) => ({
        email,
        password: VOTER_PASSWORD,
        name: `Cand ${i}`,
        role: 'CANDIDATE'
    }))
    const voterData = voterEmails.map((email, i) => ({
        email,
        password: VOTER_PASSWORD,
        name: `Voter ${i}`,
        role: 'VOTER'
    }))
    const negData = negEmails.map((email, i) => ({ email, password: VOTER_PASSWORD, name: `Neg ${i}`, role: 'VOTER' }))
    // Bulk-create hashes each password with argon2 (~55ms/user, SEQUENTIAL on the server),
    // and every request is capped by a hard 5s server-side TimeoutInterceptor. So keep each
    // batch small (USER_CREATE_BATCH) — big batches (e.g. 500) blow past 5s → 408. Sequential
    // (not parallel) on purpose: parallel argon2 batches contend for CPU and inflate each
    // call's wall time over the 5s ceiling.
    for (const batch of chunk([...candData, ...voterData, ...negData], USER_CREATE_BATCH)) {
        await http(BFF, 'POST', '/identity/user/create-bulk-users', { token: adminToken, body: { data: batch } })
    }
    logStage(
        `create ${N_CANDIDATES} candidates + ${N_VOTERS} voters${NEG_VOTERS ? ` + ${NEG_VOTERS} reserved` : ''}`,
        t
    )

    // 3. Resolve ids by email (filter returns the user list from the DB)
    t = performance.now()
    const candIds = await resolveIds(adminToken, 'CANDIDATE', candEmails)
    const allVoterIds = await resolveIds(adminToken, 'VOTER', [...voterEmails, ...negEmails])
    const voterIds = allVoterIds.slice(0, N_VOTERS)
    const negVoterIds = allVoterIds.slice(N_VOTERS)
    logStage('resolve user ids', t)

    // 4. Create election
    t = performance.now()
    const election = await http(BFF, 'POST', '/coordinator/election/create', {
        token: adminToken,
        body: { name: `loadtest-${RUN_ID}`, candidateIds: candIds, maxSelectableCandidates: MAX_SELECT }
    })
    const electionId = election._id ?? election.id
    logStage(`create election ${electionId}`, t)

    // 5. Add voters (reserved voters are added too, so their start-session passes the
    //    "voter is in this election" check during the integrity tests). Batched under the
    //    5s server timeout (no argon2 here, so a larger batch than user-create is fine).
    t = performance.now()
    for (const batch of chunk([...voterIds, ...negVoterIds], ADD_VOTERS_BATCH)) {
        await http(BFF, 'POST', `/coordinator/election/${electionId}/add-voters`, {
            token: adminToken,
            body: { voterIds: batch }
        })
    }
    logStage('add voters to election', t)

    // 6. Start election -> collectivePublicKey
    t = performance.now()
    const started = await http(BFF, 'PATCH', `/coordinator/election/${electionId}/start`, { token: adminToken })
    const P = hexToPoint(started.collectivePublicKey, params)
    logStage('start election (gen keys)', t)

    // builds a real signed voting session for a (reserved) voter, up to but NOT including
    // submit — used by the forged-signature integrity test.
    async function preparedSession(email) {
        const vToken = await signIn(email)
        const session = await http(BFF, 'POST', `/coordinator/vote/${electionId}/start-session`, { token: vToken })
        const C = hexToPoint(session.collectiveCommitment, params)
        const chosen = pickCandidates(candIds, MAX_SELECT, 0)
        const message = buildVoteMessage(electionId, chosen)
        const { r, alpha, Cprime } = blind(message, C, params, P)
        const signed = await http(BFF, 'POST', '/coordinator/vote/sign', {
            token: vToken,
            body: { rHex: scalarToHex(r), sessionId: session.sessionId }
        })
        return { vToken, session, Cprime, signatureHex: signed.signatureHex, alpha }
    }

    // 7. Each voter: blind vote
    console.log(`\n  -> voting ${N_VOTERS} ballots (concurrency ${CONCURRENCY})...`)
    const ballots = new Array(N_VOTERS) // stores {candidateIds, hHex, sPrimeHex} for reveal
    // per-sub-step latencies, so we can see which leg dominates (threshold sign vs chain submit)
    const stepDurations = { signin: [], session: [], sign: [], submit: [] }
    const voteStart = performance.now()
    const voteRes = await pool(
        voterIds,
        CONCURRENCY,
        async (voterId, i) => {
            // voter sign-in (no Origin = admin web header, so the voter is not blocked)
            const voter = await timed(stepDurations.signin, () =>
                http(BFF, 'POST', '/identity/auth/sign-in', {
                    body: { email: voterEmails[i], password: VOTER_PASSWORD }
                })
            )
            const vToken = voter.accessToken

            // start session (signing nodes create the collective commitment)
            const session = await timed(stepDurations.session, () =>
                http(BFF, 'POST', `/coordinator/vote/${electionId}/start-session`, { token: vToken })
            )
            const C = hexToPoint(session.collectiveCommitment, params)

            // choose candidate(s) (round-robin, respecting maxSelectable)
            const chosen = pickCandidates(candIds, MAX_SELECT, i)
            const message = buildVoteMessage(electionId, chosen)

            // blind
            const { r, alpha, h, Cprime } = blind(message, C, params, P)

            // blind sign (threshold signing across the signing nodes)
            const signed = await timed(stepDurations.sign, () =>
                http(BFF, 'POST', '/coordinator/vote/sign', {
                    token: vToken,
                    body: { rHex: scalarToHex(r), sessionId: session.sessionId }
                })
            )
            const s = hexToScalar(signed.signatureHex)

            // unblind + local verify
            const sPrime = unblind(s, alpha, params.n)
            if (!verify(message, h, sPrime, params, P)) {
                throw new Error('local signature verify failed')
            }

            // submit (writes the ballot to the Fabric chain — usually the slowest leg)
            await timed(stepDurations.submit, () =>
                http(BFF, 'POST', `/coordinator/vote/${electionId}/submit-blinded-commitment`, {
                    token: vToken,
                    body: {
                        blindedCommitment: blindedCommitmentHex(Cprime),
                        signatureHex: signed.signatureHex,
                        sessionId: session.sessionId
                    }
                })
            )

            ballots[i] = {
                candidateIds: canonicalizeCandidateIds(chosen),
                hHex: scalarToHex(h),
                sPrimeHex: scalarToHex(sPrime)
            }
        },
        { delayFn: () => randInt(VOTE_DELAY_MIN, VOTE_DELAY_MAX) }
    )
    reportPhase('VOTE', voteRes, performance.now() - voteStart)
    reportSubSteps(stepDurations)

    // 7b. Integrity tests while the election is still ACTIVE (double-vote, forged signature)
    if (DO_NEGATIVE) {
        console.log(`\n  -> integrity tests (election ACTIVE)...`)
        // A voter who already voted must NOT be able to open a new voting session.
        await expectReject(
            'double-vote (start-session, voted)',
            { status: 409, msgIncludes: 'already voted' },
            async () => {
                const token = await signIn(voterEmails[0])
                await http(BFF, 'POST', `/coordinator/vote/${electionId}/start-session`, { token })
            }
        )
        // A valid session with a TAMPERED signature must be rejected at submit (no ballot written).
        await expectReject('forged-signature submit', { status: 409, msgIncludes: 'mismatch' }, async () => {
            const ps = await preparedSession(negEmails[0])
            await http(BFF, 'POST', `/coordinator/vote/${electionId}/submit-blinded-commitment`, {
                token: ps.vToken,
                body: {
                    blindedCommitment: blindedCommitmentHex(ps.Cprime),
                    signatureHex: bumpScalarHex(ps.signatureHex),
                    sessionId: ps.session.sessionId
                }
            })
        })
    }

    // 8. Close election
    t = performance.now()
    const closed = await http(BFF, 'PATCH', `/coordinator/election/${electionId}/close`, { token: adminToken })
    logStage(`close election (merkleRoot=${(closed.merkleRoot ?? '').slice(0, 12)}...)`, t)

    // 8b. Integrity tests in the CLOSED window (election is CLOSED, before all ballots are
    //     revealed → reveal-side guards are reachable; once every ballot is revealed the
    //     election auto-completes and every reveal returns "already completed" instead).
    // reveal-side checks need 3 distinct ballots (forged / wrong-candidate / replay).
    const revealNegOk = DO_NEGATIVE && DO_REVEAL && ballots[0] && ballots[1] && ballots[2]
    if (DO_NEGATIVE) {
        console.log(`\n  -> integrity tests (election CLOSED)...`)
        // A not-yet-voted (reserved) voter cannot start a session after close.
        await expectReject('vote-after-close (start-session)', { status: 400, msgIncludes: 'not active' }, async () => {
            const token = await signIn(negEmails[1])
            await http(BFF, 'POST', `/coordinator/vote/${electionId}/start-session`, { token })
        })
        if (revealNegOk) {
            // A reveal with a tampered s' must fail signature verification (forged ballot).
            await expectReject('forged-signature reveal', { status: 400, msgIncludes: 'invalid signature' }, () =>
                http(REVEAL, 'POST', `/reveal-vote/${electionId}/reveal`, {
                    body: {
                        candidateIds: ballots[1].candidateIds,
                        h: ballots[1].hHex,
                        sPrime: bumpScalarHex(ballots[1].sPrimeHex)
                    }
                })
            )
            // A reveal naming a candidate outside the election must be rejected.
            await expectReject(
                'reveal candidate-not-in-election',
                { status: 403, msgIncludes: 'not in the election' },
                () =>
                    http(REVEAL, 'POST', `/reveal-vote/${electionId}/reveal`, {
                        body: {
                            candidateIds: ['ffffffffffffffffffffffff'],
                            h: ballots[2].hHex,
                            sPrime: ballots[2].sPrimeHex
                        }
                    })
            )
            // Reveal ballot[0] for real (counts toward the tally), then replay it → must be rejected.
            // ballot[0] is excluded from the measured reveal phase below to keep the total at N.
            await http(REVEAL, 'POST', `/reveal-vote/${electionId}/reveal`, {
                body: { candidateIds: ballots[0].candidateIds, h: ballots[0].hHex, sPrime: ballots[0].sPrimeHex }
            })
            await expectReject('double-reveal (replay)', { status: 409, msgIncludes: 'already been revealed' }, () =>
                http(REVEAL, 'POST', `/reveal-vote/${electionId}/reveal`, {
                    body: { candidateIds: ballots[0].candidateIds, h: ballots[0].hHex, sPrime: ballots[0].sPrimeHex }
                })
            )
        }
    }

    // 9. Reveal (anonymous, reveal-vote port)
    if (DO_REVEAL) {
        // when revealNegOk, ballot[0] was already revealed in the integrity block above
        const revealCount = N_VOTERS - (revealNegOk ? 1 : 0)
        console.log(
            `\n  -> revealing ${revealCount} ballots (concurrency ${CONCURRENCY})` +
                `${revealNegOk ? ' [ballot[0] already revealed by integrity test]' : ''}...`
        )
        const revealStart = performance.now()
        const toReveal = ballots.map((b, i) => ({ b, i })).filter((x) => x.b && !(revealNegOk && x.i === 0))
        const revealRes = await pool(
            toReveal,
            CONCURRENCY,
            async ({ b }) => {
                await http(REVEAL, 'POST', `/reveal-vote/${electionId}/reveal`, {
                    body: { candidateIds: b.candidateIds, h: b.hHex, sPrime: b.sPrimeHex }
                })
            },
            { delayFn: () => randInt(REVEAL_DELAY_MIN, REVEAL_DELAY_MAX) }
        )
        reportPhase('REVEAL', revealRes, performance.now() - revealStart)

        // 10. Tally
        t = performance.now()
        const tally = await http(REVEAL, 'GET', `/reveal-vote/${electionId}/tally`)
        logStage('tally', t)
        console.log('\n  Tally result:')
        console.dir(tally, { depth: 4 })
    }

    reportNegatives()

    console.log(`\n=== DONE in ${ms(performance.now() - grandStart)} | electionId=${electionId} ===\n`)
}

function reportPhase(name, res, totalMs) {
    const st = stats(res.durations)
    const tput = res.ok / (totalMs / 1000)
    console.log(
        `  [${name}] ok=${res.ok} fail=${res.fail} | wall=${ms(totalMs)} | ${tput.toFixed(1)} req/s | ` +
            `p50=${ms(st.p50)} p95=${ms(st.p95)} avg=${ms(st.avg)} max=${ms(st.max)}`
    )
    console.log(`  [${name}] (latency excludes the random pre-request delay; wall/throughput include it)`)
    if (res.errors.length) {
        console.log(`  [${name}] sample errors:`)
        res.errors.forEach((e) => console.log(`    - ${e}`))
    }
}

// round-robin candidate selection to spread the votes
function pickCandidates(candIds, max, seed) {
    const k = Math.max(1, max)
    if (k === 1) return [candIds[seed % candIds.length]]
    const out = []
    for (let j = 0; j < k && j < candIds.length; j++) out.push(candIds[(seed + j) % candIds.length])
    return out
}

// Resolve user ids by EXACT email match, one request per email, bounded-concurrency.
// We deliberately do NOT page through `?role=...` : the filter endpoint orders by
// createdAt with skip/take, and createMany stamps a whole batch with the same createdAt,
// so offset pagination over that tie-heavy (and possibly bloated) collection can silently
// SKIP rows — they never appear on any page. An exact email match returns the one user
// and is immune to pagination/ordering and to leftover users from earlier runs.
async function resolveIds(token, role, emails) {
    const ids = new Array(emails.length)
    const limit = Math.min(25, emails.length)
    let idx = 0
    async function runner() {
        while (idx < emails.length) {
            const i = idx++
            const email = emails[i]
            const res = await http(
                BFF,
                'GET',
                `/identity/user/filter?role=${role}&email=${encodeURIComponent(email)}&pageSize=1`,
                { token }
            )
            const u = (res?.data ?? [])[0]
            if (!u) throw new Error(`Could not resolve id for ${role} ${email}`)
            ids[i] = u._id ?? u.id
        }
    }
    await Promise.all(Array.from({ length: limit }, runner))
    return ids
}

function chunk(arr, size) {
    const out = []
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
    return out
}

main().catch((e) => {
    console.error('\nx LOAD TEST FAILED:', e.message)
    process.exit(1)
})
