#!/usr/bin/env bash
# Polls target health, the ASG and the HealthyHostCount alarm every INTERVAL
# seconds (default 10) and appends one timestamped line per poll to the log.
# Started by `infra/evidence/capture.sh watch <label>`. Ctrl-C to stop.
# AWS errors (e.g. expired Lab credentials) are logged and polling continues.
set -uo pipefail
# shellcheck source=infra/evidence/env.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/env.sh"
log=${1:?usage: watch.sh <log file>}
load_stack
echo "watch: every ${INTERVAL:-10} s → $log (Ctrl-C to stop)"

while true; do
  targets=$(aws elbv2 describe-target-health --target-group-arn "$TG_ARN" \
    --query 'TargetHealthDescriptions[].[Target.Id,TargetHealth.State]' --output text 2>&1 |
    awk '{ printf "%s=%s ", $1, $2 }') || targets="ERR"
  group=$(aws autoscaling describe-auto-scaling-groups --auto-scaling-group-names "$ASG" --output json 2>&1 |
    jq -r '.AutoScalingGroups[0] | "desired=\(.DesiredCapacity) " +
      ([.Instances[] | "\(.InstanceId)(\(.AvailabilityZone | sub("us-east-"; "")),\(.LifecycleState),\(.HealthStatus))"] | join(" "))' 2>&1) ||
    group="ERR"
  alarm=$(aws cloudwatch describe-alarms --alarm-names "$ALARM" \
    --query 'MetricAlarms[0].StateValue' --output text 2>&1) || alarm="ERR"
  echo "$(ts) | alarm=$alarm | targets: $targets| asg: $group" | tee -a "$log"
  sleep "${INTERVAL:-10}"
done
