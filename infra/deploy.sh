#!/usr/bin/env bash
# Creates or updates the Game Library stack from this Mac (docs/GROUP_ARCHITECTURE.md, D15).
#
#   infra/deploy.sh [--disable-rollback] [ParameterKey=Value ...]
#
# Needs AWS CLI v2 with the Learner Lab credentials from "AWS Details" (in
# ~/.aws/credentials or the environment), git and openssl. Reads the secrets
# and alert email from infra/deploy.env (see infra/deploy.env.example).
#
#   1. Checks the credentials and resolves origin main to a commit SHA, which
#      every instance builds (GitCommit). Push first: instances clone GitHub.
#   2. Reuses the self-signed certificate already imported into ACM, or
#      generates and imports one.
#   3. Runs `aws cloudformation deploy` and prints the stack outputs.
#
# Extra ParameterKey=Value arguments override template defaults, e.g.
#   infra/deploy.sh TargetRequestsPerInstance=450 HealthCheckGracePeriod=600
set -Eeuo pipefail

# Empty arrays use ${a[@]+"${a[@]}"}: macOS ships bash 3.2, where "${a[@]}" trips set -u.
here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
repo=$(cd "$here/.." && pwd)
template=$here/game-library.yaml
env_file=$here/deploy.env
repository_url=https://github.com/muniuni/infs3701-game-library.git

die() { echo "deploy: $*" >&2; exit 1; }
log() { echo "deploy: $*"; }

rollback_args=()
overrides=()
for argument in "$@"; do
  case $argument in
    --disable-rollback) rollback_args=(--disable-rollback) ;;
    -h | --help) sed -n '2,17p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *=*) overrides+=("$argument") ;;
    *) die "unknown argument: $argument (see --help)" ;;
  esac
done

for tool in aws git openssl; do
  command -v "$tool" >/dev/null || die "$tool is not installed"
done

# --- Settings ----------------------------------------------------------------
[[ -f $env_file ]] || die "missing $env_file (copy infra/deploy.env.example)"
set -a
# shellcheck source=/dev/null
. "$env_file"
set +a
for name in IGDB_CLIENT_ID IGDB_CLIENT_SECRET STEAM_WEB_API_KEY ALERT_EMAIL; do
  [[ -n ${!name:-} ]] || die "$name is empty in $env_file"
done
stack=${STACK_NAME:-game-library}
region=${AWS_REGION:-us-east-1}
export AWS_REGION=$region AWS_DEFAULT_REGION=$region AWS_PAGER=""

# --- 1. Credentials and commit -----------------------------------------------
account=$(aws sts get-caller-identity --query Account --output text) ||
  die "AWS credentials don't work; paste fresh ones from the Lab's AWS Details panel"
log "account $account, region $region, stack $stack"

commit=$(git ls-remote "$repository_url" refs/heads/main | cut -f1)
[[ $commit =~ ^[0-9a-f]{40}$ ]] || die "could not resolve main on $repository_url"
log "instances will build main at $commit"
if [[ $(git -C "$repo" rev-parse HEAD) != "$commit" ]]; then
  log "WARNING: local HEAD is not origin main. Push first if instances need your local changes."
fi

# --- 2. Certificate ----------------------------------------------------------
# Self-signed for the ALB's DNS names, so the only browser warning is the
# untrusted issuer (D10). ACM can't be imported from CloudFormation.
domain="*.$region.elb.amazonaws.com"
certificate=$(aws acm list-certificates --certificate-statuses ISSUED \
  --query "CertificateSummaryList[?DomainName=='$domain' && Type=='IMPORTED'] | [0].CertificateArn" \
  --output text)
if [[ $certificate == arn:* ]]; then
  log "reusing certificate $certificate"
else
  work=$(mktemp -d)
  trap 'rm -rf "$work"' EXIT
  cat >"$work/openssl.cnf" <<EOF
[req]
distinguished_name = dn
x509_extensions = ext
prompt = no
[dn]
CN = $domain
O = INFS3701 Game Library (self-signed)
[ext]
subjectAltName = DNS:$domain
basicConstraints = critical, CA:FALSE
keyUsage = critical, digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
EOF
  openssl req -x509 -newkey rsa:2048 -nodes -sha256 -days 90 \
    -config "$work/openssl.cnf" -keyout "$work/key.pem" -out "$work/cert.pem" 2>/dev/null
  certificate=$(aws acm import-certificate \
    --certificate "fileb://$work/cert.pem" --private-key "fileb://$work/key.pem" \
    --tags Key=Name,Value="$stack" --query CertificateArn --output text)
  log "imported certificate $certificate"
fi

# --- 3. Stack ----------------------------------------------------------------
size=$(wc -c <"$template" | tr -d ' ')
((size <= 51200)) ||
  die "template is $size bytes, over the 51,200-byte inline limit; upload it to S3 (--s3-bucket)"

log "deploying (stack creation takes about 25-35 minutes)"
aws cloudformation deploy \
  --stack-name "$stack" \
  --template-file "$template" \
  --no-fail-on-empty-changeset \
  ${rollback_args[@]+"${rollback_args[@]}"} \
  --parameter-overrides \
  "GitCommit=$commit" \
  "RepositoryUrl=$repository_url" \
  "CertificateArn=$certificate" \
  "IgdbClientId=$IGDB_CLIENT_ID" \
  "IgdbClientSecret=$IGDB_CLIENT_SECRET" \
  "SteamWebApiKey=$STEAM_WEB_API_KEY" \
  "AlertEmail=$ALERT_EMAIL" \
  ${overrides[@]+"${overrides[@]}"}

aws cloudformation describe-stacks --stack-name "$stack" \
  --query 'Stacks[0].Outputs[].[OutputKey,OutputValue]' --output table
log "confirm the SNS subscription email if this was a new stack"
