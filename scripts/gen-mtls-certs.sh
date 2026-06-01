#!/usr/bin/env bash
#
# Generate an internal CA and certificates for each internal service (mTLS).
#
# Run from the workspace root:
#   bash scripts/gen-mtls-certs.sh
#
# Output: ./certs/{ca.crt, <service>.crt, <service>.key}
#
# Each service uses a single certificate for all three roles:
# TCP server, TCP client, and Redis client
# (EKU = serverAuth,clientAuth).
#
# SAN includes the service name (for Docker DNS), localhost,
# and 127.0.0.1 so the certificate works both locally
# and inside a Docker network.
#
set -euo pipefail

CERT_DIR="${CERT_DIR:-./certs}"
DAYS_CA="${DAYS_CA:-3650}"     # CA certificate: 10 years
DAYS_CERT="${DAYS_CERT:-365}" # Service certificate: 1 year (rotate annually)

# List of services that require certificates.
# Signing nodes use separate certificates per node.
SERVICES=(
  bff
  identity
  coordinator
  signing-node-1
  signing-node-2
  signing-node-3
  reveal-vote
  socket
  redis
)

mkdir -p "$CERT_DIR"
cd "$CERT_DIR"

# 1) Root CA — generate only if it does not already exist
# (to avoid breaking trust for previously issued certificates)
if [[ ! -f ca.crt ]]; then
  echo "==> Creating Root CA (evoting-internal-ca)"
  openssl genrsa -out ca.key 4096
  openssl req -x509 -new -nodes -key ca.key -sha256 -days "$DAYS_CA" \
    -subj "/CN=evoting-internal-ca/O=e-voting" -out ca.crt
  chmod 600 ca.key
else
  echo "==> Existing CA found, reusing ca.crt"
fi

# 2) Generate a certificate for each service (server + client)
# signed by the internal CA
gen_cert() {
  local name="$1"
  echo "==> Generating certificate for: $name"
  openssl genrsa -out "$name.key" 2048
  openssl req -new -key "$name.key" -subj "/CN=$name/O=e-voting" -out "$name.csr"
  openssl x509 -req -in "$name.csr" -CA ca.crt -CAkey ca.key -CAcreateserial \
    -days "$DAYS_CERT" -sha256 -out "$name.crt" \
    -extfile <(printf "%s\n%s\n%s\n%s" \
      "subjectAltName=DNS:$name,DNS:localhost,IP:127.0.0.1" \
      "extendedKeyUsage=serverAuth,clientAuth" \
      "basicConstraints=CA:FALSE" \
      "keyUsage=digitalSignature,keyEncipherment")
  rm -f "$name.csr"
  chmod 600 "$name.key"
}

for svc in "${SERVICES[@]}"; do
  gen_cert "$svc"
done

echo
echo "✅ Done. Certificates are available in: $CERT_DIR"
echo "   - ca.crt is the shared trust anchor (TLS_CA_PATH)"
echo "   - each service should point TLS_CERT_PATH/TLS_KEY_PATH"
echo "     to its own certificate and private key"
echo
echo "To enable mTLS, set MTLS_ENABLED=true in each service's .env file,"
echo "and start Redis with TLS using:"
echo "docker compose -f docker-compose.yml -f docker-compose.mtls.yml up -d"