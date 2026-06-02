#!/usr/bin/env bash
# Drop all test DBs (*_test) in the MongoDB container and remove the .env.test files.
# Safe: only touches DBs with the _test suffix, never the dev DBs.
set -uo pipefail
cd "$(dirname "$0")/../.."

CONTAINER="${MONGO_CONTAINER:-mongodb}"
USER="${MONGO_ROOT_USER:-root}"
PASS="${MONGO_ROOT_PASSWORD:-password}"
DBS=(identityDb_test coordinatorDb_test revealVoteDb_test signingNode1Db_test signingNode2Db_test signingNode3Db_test)

echo "==> Dropping ${#DBS[@]} test DBs in container '$CONTAINER'"
for db in "${DBS[@]}"; do
  docker exec "$CONTAINER" mongosh --quiet -u "$USER" -p "$PASS" --authenticationDatabase admin \
    --eval "db.getSiblingDB('$db').dropDatabase()" >/dev/null 2>&1 \
    && echo "   ok dropped $db" || echo "   ! could not drop $db (container/credentials?)"
done

# Flush this run's Redis keys (short-lived session keys; skip by default to preserve dev state)
if [ "${FLUSH_REDIS:-0}" = "1" ]; then
  echo "==> FLUSHDB Redis (FLUSH_REDIS=1)"
  docker exec redis redis-cli -a "${REDIS_PASSWORD:-secret}" FLUSHDB >/dev/null 2>&1 && echo "   ok redis flushed"
fi

echo "==> Removing .env.test files"
rm -f apps/identity/.env.test apps/coordinator/.env.test apps/reveal-vote/.env.test apps/bff/.env.test \
      apps/signing-node/.node1.env.test apps/signing-node/.node2.env.test apps/signing-node/.node3.env.test
echo "Done."
