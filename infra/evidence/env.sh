# Sourced by the S4 evidence scripts (infra/evidence/README.md). Not run directly.
# Resolves every name from the live stack, so nothing account-specific is in git.
# shellcheck shell=bash

evidence_here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
repo=$(cd "$evidence_here/../.." && pwd)
STACK=${STACK_NAME:-game-library}
export AWS_REGION=${AWS_REGION:-us-east-1}
export AWS_DEFAULT_REGION=$AWS_REGION AWS_PAGER=""
# Gitignored: the output holds the account ID, ARNs and the ALB DNS name.
EVIDENCE_DIR=${EVIDENCE_DIR:-$repo/evidence/s4-$(date +%Y%m%d)}
mkdir -p "$EVIDENCE_DIR"

# Local time with offset, e.g. 2026-11-15T14:03:09+1100 (the doc uses Sydney time).
ts() { date +%Y-%m-%dT%H:%M:%S%z; }
stamp() { date +%H%M%S; }

die() { echo "evidence: $*" >&2; exit 1; }

# Loads stack outputs and physical resource IDs into shell variables.
load_stack() {
  local resources=$EVIDENCE_DIR/.resources
  aws cloudformation describe-stack-resources --stack-name "$STACK" \
    --query 'StackResources[].[LogicalResourceId,PhysicalResourceId]' --output text >"$resources" ||
    die "stack $STACK not found (or credentials expired: paste fresh ones from AWS Details)"
  res() { awk -v key="$1" '$1 == key { print $2 }' "$resources"; }
  ASG=$(res AppAutoScalingGroup)
  TG_ARN=$(res TargetGroup)
  LB_ARN=$(res LoadBalancer)
  ALARM=$(res HealthyHostsAlarm)
  DB_ID=$(res Database)
  BUCKET=$(res CoversBucket)
  TOPIC_ARN=$(res AlertTopic)
  APP_SUBNET_A=$(res AppSubnetA)
  APP_SUBNET_B=$(res AppSubnetB)
  SG_ALB=$(res AlbSecurityGroup)
  SG_APP=$(res AppSecurityGroup)
  SG_DB=$(res DbSecurityGroup)
  APP_URL=$(aws cloudformation describe-stacks --stack-name "$STACK" \
    --query "Stacks[0].Outputs[?OutputKey=='AppUrl'].OutputValue" --output text)
  [[ -n $ASG && -n $TG_ARN && $APP_URL == https://* ]] ||
    die "stack $STACK is not complete yet"
}
