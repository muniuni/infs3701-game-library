#!/usr/bin/env bash
# Builds and starts Game Library on a fresh Amazon Linux 2023 instance.
# See docs/GROUP_ARCHITECTURE.md, D4. Runs as root from EC2 user data, which:
#   1. writes /etc/game-library/stack.env (non-secret values from the stack),
#   2. installs git and clones the repo to /opt/game-library at the pinned
#      GitCommit,
#   3. runs `bash /opt/game-library/infra/bootstrap.sh` (no reliance on the
#      file's exec bit).
#
# stack.env keys (all required except DB_PORT and the two CFN_ keys):
#   AWS_REGION S3_BUCKET DB_HOST DB_PORT DB_NAME DB_SECRET_ARN
#   IGDB_SECRET_ID STEAM_SECRET_ID CFN_STACK_NAME CFN_RESOURCE
# With CFN_STACK_NAME and CFN_RESOURCE set, the result is reported to the
# ASG CreationPolicy with cfn-signal (success only once the app answers).
#
# Output goes to /var/log/cloud-init-output.log. No secret is written to disk:
# the database password is read at process start by with-database-url.mjs.
set -Eeuo pipefail

APP_DIR=/opt/game-library
APP_USER=game-library
APP_HOME=/var/lib/game-library
CONFIG_DIR=/etc/game-library
STACK_ENV=$CONFIG_DIR/stack.env
APP_ENV=$CONFIG_DIR/app.env
CA_BUNDLE=$CONFIG_DIR/rds-ca-bundle.pem
CA_FILE=$CONFIG_DIR/rds-ca.pem
NODE_MAJOR=24
START=$SECONDS

log() { echo "[bootstrap +$((SECONDS - START))s] $*"; }

signal() {
  if [[ -n ${CFN_STACK_NAME:-} && -n ${CFN_RESOURCE:-} && -x /opt/aws/bin/cfn-signal ]]; then
    /opt/aws/bin/cfn-signal --exit-code "$1" --stack "$CFN_STACK_NAME" \
      --resource "$CFN_RESOURCE" --region "$AWS_REGION" || log "cfn-signal failed"
  fi
}

on_error() {
  local status=$? line=$1
  log "FAILED (exit $status) at line $line"
  signal 1
  exit "$status"
}
trap 'on_error $LINENO' ERR

# Runs a command as the app user in the app directory.
as_app() {
  runuser -u "$APP_USER" -- env -C "$APP_DIR" HOME="$APP_HOME" NEXT_TELEMETRY_DISABLED=1 "$@"
}

# The same, with app.env loaded as the systemd units load it.
as_app_with_env() {
  # shellcheck disable=SC2016 # expanded by the inner shell, not this one
  as_app bash -c 'set -a; . "$0"; set +a; exec "$@"' "$APP_ENV" "$@"
}

imds() {
  curl -fsS --retry 3 -H "X-aws-ec2-metadata-token: $IMDS_TOKEN" \
    "http://169.254.169.254/latest/meta-data/$1"
}

# --- Inputs ------------------------------------------------------------------
[[ $(id -u) -eq 0 ]] || { echo "Run as root." >&2; exit 1; }
[[ -f $STACK_ENV ]] || { echo "Missing $STACK_ENV." >&2; exit 1; }
set -a
# shellcheck source=/dev/null
. "$STACK_ENV"
set +a
DB_PORT=${DB_PORT:-5432}
for name in AWS_REGION S3_BUCKET DB_HOST DB_NAME DB_SECRET_ARN IGDB_SECRET_ID STEAM_SECRET_ID; do
  [[ -n ${!name:-} ]] || { log "$name is missing from $STACK_ENV"; false; }
done
[[ $(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd) == "$APP_DIR" ]] ||
  { log "Expected the repo at $APP_DIR"; false; }

# Read before the repo changes owner (git refuses repos owned by other users).
GIT_COMMIT=$(git -C "$APP_DIR" rev-parse HEAD)
IMDS_TOKEN=$(curl -fsS --retry 3 -X PUT http://169.254.169.254/latest/api/token \
  -H "X-aws-ec2-metadata-token-ttl-seconds: 300")
INSTANCE_ID=$(imds instance-id)
AVAILABILITY_ZONE=$(imds placement/availability-zone)
log "commit $GIT_COMMIT on $INSTANCE_ID in $AVAILABILITY_ZONE"

# --- Packages ----------------------------------------------------------------
dnf install -y -q aws-cfn-bootstrap nginx openssl "nodejs$NODE_MAJOR" "nodejs$NODE_MAJOR-npm"
[[ $(node -p 'process.versions.node.split(".")[0]') == "$NODE_MAJOR" ]] ||
  { log "node is not Node.js $NODE_MAJOR"; false; }
log "packages installed: node $(node --version), npm $(npm --version)"

# next build can exceed the 2 GiB of a t3.small; swap avoids an OOM kill.
if ! swapon --show=NAME --noheadings | grep -q .; then
  dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none
  chmod 600 /swapfile
  # AL2023's util-linux mkswap has no -q/--quiet option.
  mkswap /swapfile >/dev/null
  swapon /swapfile
  log "2 GiB swap enabled"
fi

# --- App user and configuration -----------------------------------------------
id "$APP_USER" &>/dev/null ||
  useradd --system --home-dir "$APP_HOME" --create-home --shell /sbin/nologin "$APP_USER"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"
install -d -m 0755 "$CONFIG_DIR"

# RDS CA: the app (pg) and Prisma Migrate both use the one CA from the regional
# bundle that verifies this endpoint. Prisma can't read a multi-cert bundle.
curl -fsS --retry 3 -o "$CA_BUNDLE" \
  "https://truststore.pki.rds.amazonaws.com/$AWS_REGION/$AWS_REGION-bundle.pem"
bash "$APP_DIR/infra/select-db-ca.sh" "$CA_BUNDLE" "$DB_HOST" "$DB_PORT" "$CA_FILE"

# Non-secret settings for the app, the cleanup timer and migrations.
umask 027
cat >"$APP_ENV" <<EOF
NODE_ENV=production
NEXT_TELEMETRY_DISABLED=1
STORAGE_MODE=s3
SECRETS_SOURCE=aws
AWS_REGION=$AWS_REGION
S3_BUCKET=$S3_BUCKET
DB_HOST=$DB_HOST
DB_PORT=$DB_PORT
DB_NAME=$DB_NAME
DB_SECRET_ARN=$DB_SECRET_ARN
DATABASE_CA_FILE=$CA_FILE
IGDB_SECRET_ID=$IGDB_SECRET_ID
STEAM_SECRET_ID=$STEAM_SECRET_ID
INSTANCE_ID=$INSTANCE_ID
AVAILABILITY_ZONE=$AVAILABILITY_ZONE
GIT_COMMIT=$GIT_COMMIT
EOF
umask 022
chown "root:$APP_USER" "$APP_ENV"
chmod 0640 "$APP_ENV"

# --- Build and migrate -------------------------------------------------------
# npm ci without NODE_ENV=production: the build and cleanup need dev packages.
as_app npm ci --no-audit --no-fund
log "npm ci done"
as_app GIT_COMMIT="$GIT_COMMIT" npm run build
log "build done"
# Prisma Migrate takes an advisory lock, so instances booting together are safe.
as_app_with_env node scripts/with-database-url.mjs npm run db:deploy
log "migrations applied"

# --- Nginx and systemd -------------------------------------------------------
sed "s|@SERVED_BY@|$INSTANCE_ID $AVAILABILITY_ZONE|" \
  "$APP_DIR/infra/nginx/game-library.conf" >/etc/nginx/conf.d/game-library.conf
nginx -t
install -m 0644 "$APP_DIR"/infra/systemd/game-library{.service,-cleanup.service,-cleanup.timer} \
  /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now nginx game-library.service game-library-cleanup.timer
systemctl reload nginx

# --- Ready -------------------------------------------------------------------
for _ in $(seq 1 60); do
  if curl -fsS -o /dev/null http://127.0.0.1/api/health; then
    log "app healthy through Nginx"
    signal 0
    exit 0
  fi
  sleep 2
done
log "app did not answer /api/health within 120 s"
false
