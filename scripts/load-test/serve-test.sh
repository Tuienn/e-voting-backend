#!/usr/bin/env bash
# Build once, then run every service with the TEST env (DB *_test) in the background.
# PIDs are saved to scripts/load-test/.pids, logs to logs/test/<service>.log
# Stop with: scripts/load-test/stop-test.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
ROOT="$(pwd)"
PID_FILE="scripts/load-test/.pids"
LOG_DIR="logs/test"
mkdir -p "$LOG_DIR"
: > "$PID_FILE"

echo "==> Generating .env.test files"
node scripts/load-test/gen-test-env.mjs

echo "==> Building all apps (once)"
pnpm nx run-many -t build >/dev/null

# start <app> <env-file>
start() {
  local app="$1" env="$2"
  echo "==> start $app  (env=$env)"
  node --env-file="$env" "dist/apps/$app/main.js" >"$LOG_DIR/$app.log" 2>&1 &
  echo "$!" >> "$PID_FILE"
}
# signing-node is a single app run as 3 instances on different env/ports -> separate logs per node
start_node() {
  local n="$1" env="$2"
  echo "==> start signing-node-$n  (env=$env)"
  node --env-file="$env" "dist/apps/signing-node/main.js" >"$LOG_DIR/signing-node-$n.log" 2>&1 &
  echo "$!" >> "$PID_FILE"
}

start identity     apps/identity/.env.test
start_node 1       apps/signing-node/.node1.env.test
start_node 2       apps/signing-node/.node2.env.test
start_node 3       apps/signing-node/.node3.env.test
start coordinator  apps/coordinator/.env.test
start reveal-vote  apps/reveal-vote/.env.test
start bff          apps/bff/.env.test

wait_port() {
  local url="$1" name="$2"
  for _ in $(seq 1 60); do
    if curl -s -o /dev/null "$url"; then echo "==> $name is ready"; return 0; fi
    sleep 1
  done
  echo "!! $name did not respond within 60s -- check $LOG_DIR/"; return 1
}

echo "==> Waiting for HTTP services to be ready..."
wait_port "http://localhost:3001/api/v1/docs" "bff (3001)"         || true
wait_port "http://localhost:3007/api/v1"      "reveal-vote (3007)" || true

echo ""
echo "TEST services are running. Run the harness:"
echo "    node scripts/load-test/run.mjs --voters 10"
echo "Logs: $LOG_DIR/*.log   |   Stop: scripts/load-test/stop-test.sh"
