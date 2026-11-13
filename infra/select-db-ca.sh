#!/usr/bin/env bash
# Picks the one CA certificate in a bundle that verifies a PostgreSQL server.
#
#   infra/select-db-ca.sh <bundle.pem> <host> <port> <output.pem>
#
# Prisma Migrate reads only one certificate from `sslcert`, but the RDS
# regional bundle holds several CAs. This tries each certificate with a full
# TLS handshake (chain and host name both verified) and writes the first one
# that passes. It fails if none does, so the instance never falls back to
# unverified TLS. Needs OpenSSL 1.1.1+ for `-starttls postgres`.
set -euo pipefail

if [[ $# -ne 4 ]]; then
  echo "Usage: $0 <bundle.pem> <host> <port> <output.pem>" >&2
  exit 2
fi
bundle=$1 host=$2 port=$3 output=$4

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

# Split the bundle into cert-1.pem, cert-2.pem, ...
awk -v dir="$work" '
  /-----BEGIN CERTIFICATE-----/ { n++; file = sprintf("%s/cert-%d.pem", dir, n) }
  n { print > file }
  /-----END CERTIFICATE-----/ { close(file) }
' "$bundle"

shopt -s nullglob
certificates=("$work"/cert-*.pem)
if [[ ${#certificates[@]} -eq 0 ]]; then
  echo "select-db-ca: no certificates in $bundle" >&2
  exit 1
fi

for certificate in "${certificates[@]}"; do
  if openssl s_client -starttls postgres -connect "$host:$port" \
    -servername "$host" -verify_hostname "$host" -verify_return_error \
    -CAfile "$certificate" </dev/null >/dev/null 2>&1; then
    install -m 0644 "$certificate" "$output"
    echo "select-db-ca: $(openssl x509 -in "$certificate" -noout -subject)"
    exit 0
  fi
done

echo "select-db-ca: none of the ${#certificates[@]} certificates in $bundle verifies $host:$port" >&2
exit 1
