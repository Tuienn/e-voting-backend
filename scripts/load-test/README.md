# Load / Integration test harness

Runs the full e-voting flow over real HTTP at various voter-count milestones, on an
**isolated test database** (`*_test`) that can be dropped after each run.

## Why not plain curl

Blind voting requires **client-side** crypto: generate `α,β`, compute `C' = R + α·G + β·P`,
`r = h − β`, then unblind `s' = s + α`. curl cannot do EC math. The harness (`run.mjs`)
faithfully reproduces the EC-Schnorr secp256k1 protocol in `crypto.mjs` (using the
already-installed `@noble/curves`), so it matches the server exactly — verified with a
blind→sign→unblind→verify roundtrip.

## Requirements

- MongoDB (replica set `rs0`) + Redis running: `docker compose up -d`
- **Fabric/Chainlaunch** reachable (configured in `apps/coordinator/.env.development` →
  `FABRIC_HOST`). submit-vote / close / reveal all write to chain → this is the main
  bottleneck at large scale.
- mTLS certs generated (`scripts/gen-mtls-certs.sh`), because the test env keeps
  `MTLS_ENABLED=true`.

## Workflow

```bash
# 1. Build + run the 7 services with the TEST env (DB *_test), in the background:
./scripts/load-test/serve-test.sh

# 2. Run the harness at each milestone (repeat as needed):
node scripts/load-test/run.mjs --voters 10
node scripts/load-test/run.mjs --voters 100  --concurrency 25
node scripts/load-test/run.mjs --voters 1000 --concurrency 30

# 3. Stop the services:
./scripts/load-test/stop-test.sh

# 4. Drop all test DBs + remove the .env.test files:
./scripts/load-test/teardown-db.sh
```

Each `run.mjs` invocation uses its own `RUN_ID` (no email/election collisions), so you can
run several milestones back-to-back **without cleaning the DB in between**; only run the
teardown when you are finished.

## run.mjs flags

| Flag                    | Default | Meaning                                                                 |
| ----------------------- | ------- | ----------------------------------------------------------------------- |
| `--voters N`            | 10      | number of voters                                                        |
| `--candidates N`        | 3       | number of candidates                                                    |
| `--max N`               | 1       | `maxSelectableCandidates`                                               |
| `--concurrency N`       | 20      | parallel requests in the vote/reveal phases                             |
| `--no-reveal`           | (off)   | stop after submitting votes, skip reveal (measure the vote phase alone) |
| `--negative`            | (off)   | run integrity/negative tests (see below)                                |
| `--vote-delay-min MS`   | 0       | min random delay before each ballot's vote flow                         |
| `--vote-delay-max MS`   | 0       | max random delay before each ballot's vote flow                         |
| `--reveal-delay-min MS` | 0       | min random delay before each reveal                                     |
| `--reveal-delay-max MS` | 0       | max random delay before each reveal                                     |
| `--request-timeout MS`  | 30000   | per-HTTP-request timeout (aborts a hung request)                        |

Override endpoints/admin via env vars: `BFF_BASE_URL`, `REVEAL_BASE_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`.

### Simulating a realistic election (spread over time)

The `--vote-delay-*` / `--reveal-delay-*` flags add a **random delay before each voter's
request**, so ballots arrive spread out instead of in one burst — like a real election day.
The delay is applied _before_ the timed section, so:

- **latency** (`p50/p95/avg/max`) reflects pure server/request time, and
- **wall-clock / throughput** reflect the simulated arrival pattern.

```bash
# 200 voters, each votes at a random moment within ~5s, reveals within ~10s:
node scripts/load-test/run.mjs --voters 200 --concurrency 30 \
     --vote-delay-min 0 --vote-delay-max 5000 \
     --reveal-delay-min 0 --reveal-delay-max 10000
```

## Output

The harness prints per-phase latency (`p50/p95/avg/max`), throughput (req/s), ok/fail
counts with sample errors, and the final `tally` table for cross-checking results.

### Per-sub-step latency (VOTE phase)

The VOTE phase additionally reports the latency of each leg of the vote flow separately:

```
[VOTE sub-steps] per successful ballot (latency, ms — pinpoints the real bottleneck):
  sign-in            p50=.. p95=.. ...
  start-session      p50=.. p95=.. ...   <- signing nodes create the collective commitment
  sign (threshold)   p50=.. p95=.. ...   <- threshold blind sign across the signing nodes
  submit (chain)     p50=.. p95=.. ...   <- writes the ballot to Fabric (usually slowest)
```

This shows whether the bottleneck is the threshold signing or the Fabric write, instead of
only seeing one lumped VOTE latency.

### Integrity / negative tests (`--negative`)

With `--negative`, the harness asserts the system **rejects** the things it must reject,
under the same running services. Each check runs an operation that should fail and verifies
it fails with the expected HTTP status; none of them create a counted ballot.

| Check                         | When            | Expected rejection                     |
| ----------------------------- | --------------- | -------------------------------------- |
| double-vote (start-session)   | election ACTIVE | 409 "already voted"                    |
| forged-signature submit       | election ACTIVE | 409 "...mismatch"                      |
| vote-after-close              | election CLOSED | 400 "Election is not active"           |
| forged-signature reveal       | election CLOSED | 400 "Invalid signature"                |
| reveal candidate-not-in-elect | election CLOSED | 403 "Candidate is not in the election" |
| double-reveal (replay)        | election CLOSED | 409 "already been revealed"            |

Notes:

- Needs ≥ 3 voters for the reveal-side checks (forged / wrong-candidate / replay).
- Adds **2 reserved voters** (added to the election but never counted), used for the
  forged-submit and vote-after-close checks.
- The replay check reveals `ballot[0]` for real, so the measured reveal phase covers
  **N-1** ballots; the tally total is still N and DB↔Chain still matches.

```bash
node scripts/load-test/run.mjs --voters 10 --negative
```

## Files

- `crypto.mjs` — EC-Schnorr client (blind/unblind/verify/buildVoteMessage). Self-contained, no nx build needed.
- `run.mjs` — full-flow orchestrator + measurements + timing controls.
- `gen-test-env.mjs` — generates `.env.test` (renames DB → `*_test`, raises `THROTTLE_LIMIT`).
- `serve-test.sh` / `stop-test.sh` — start/stop the 7 services with the test env.
- `teardown-db.sh` — drop the 6 `*_test` DBs + remove `.env.test` (`FLUSH_REDIS=1` to also flush Redis).

## Notes

- Rate limit: the test env raises `THROTTLE_LIMIT` to a very high value so it does not block the load test.
- Throttle/Fabric are the real limits at 1000: pushing `--concurrency` too high may overload
  Fabric/coordinator → watch `fail` and `logs/test/*.log`.
- The socket service is not required (realtime events are fire-and-forget over Redis).
