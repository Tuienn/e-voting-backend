#!/usr/bin/env bash
#
# Enable/disable mTLS (MTLS_ENABLED) in all runtime .env files.
#
# Usage:
#   bash scripts/toggle-mtls.sh on       # set MTLS_ENABLED=true  in all files
#   bash scripts/toggle-mtls.sh off      # set MTLS_ENABLED=false in all files
#   bash scripts/toggle-mtls.sh status   # display current status
#
# By default, only runtime files are modified
# (.env, .node1.env, .node2.env, .node3.env).
#
# Add --include-examples to also update *.env.example files.
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

ACTION=""
INCLUDE_EXAMPLES=false
for arg in "$@"; do
    case "$arg" in
        on | off | status) ACTION="$arg" ;;
        --include-examples) INCLUDE_EXAMPLES=true ;;
        *)
            echo "Invalid argument: $arg" >&2
            echo "Usage: bash scripts/toggle-mtls.sh {on|off|status} [--include-examples]" >&2
            exit 1
            ;;
    esac
done

if [[ -z "$ACTION" ]]; then
    echo "Usage: bash scripts/toggle-mtls.sh {on|off|status} [--include-examples]" >&2
    exit 1
fi

# Collect environment files.
# Pattern '*.env' matches .env and .nodeN.env,
# but does NOT match *.env.example.
mapfile -t FILES < <(find "$ROOT/apps" -maxdepth 2 -type f -name '*.env' | sort)
if $INCLUDE_EXAMPLES; then
    mapfile -t EXAMPLES < <(find "$ROOT/apps" -maxdepth 2 -type f -name '*.env.example' | sort)
    FILES+=("${EXAMPLES[@]}")
fi

if [[ ${#FILES[@]} -eq 0 ]]; then
    echo "No .env files found under apps/" >&2
    exit 1
fi

set_value() {
    local value="$1" f
    for f in "${FILES[@]}"; do
        if grep -qE '^MTLS_ENABLED=' "$f"; then
            sed -i -E "s|^MTLS_ENABLED=.*|MTLS_ENABLED=${value}|" "$f"
            echo "  [=${value}] ${f#"$ROOT"/}"
        else
            echo "  [SKIPPED - MTLS_ENABLED not found] ${f#"$ROOT"/}" >&2
        fi
    done
}

show_status() {
    local f val
    for f in "${FILES[@]}"; do
        val="$(grep -E '^MTLS_ENABLED=' "$f" | head -1 | cut -d= -f2- || true)"
        printf "  %-48s %s\n" "${f#"$ROOT"/}" "${val:-<missing>}"
    done
}

case "$ACTION" in
    on)
        echo "Enabling mTLS (MTLS_ENABLED=true):"
        set_value true
        echo
        echo "⚠  Reminder:"
        echo "   (1) Generate certificates first:"
        echo "       bash scripts/gen-mtls-certs.sh"
        echo "   (2) Start Redis with TLS:"
        echo "       docker compose -f docker-compose.yml -f docker-compose.mtls.yml up -d redis"
        ;;
    off)
        echo "Disabling mTLS (MTLS_ENABLED=false):"
        set_value false
        ;;
    status)
        echo "Current MTLS_ENABLED status:"
        show_status
        ;;
esac