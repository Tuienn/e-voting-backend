#!/usr/bin/env bash
# Stop the test services started by serve-test.sh (using the saved PIDs).
set -uo pipefail
cd "$(dirname "$0")/../.."
PID_FILE="scripts/load-test/.pids"
[ -f "$PID_FILE" ] || { echo "No $PID_FILE -- nothing to stop."; exit 0; }
while read -r pid; do
  [ -n "$pid" ] || continue
  if kill -0 "$pid" 2>/dev/null; then kill "$pid" 2>/dev/null && echo "==> stopped pid $pid"; fi
done < "$PID_FILE"
rm -f "$PID_FILE"
echo "Done. (Test DBs remain -- drop them with scripts/load-test/teardown-db.sh)"
