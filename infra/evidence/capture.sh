#!/usr/bin/env bash
# S4 evidence capture (docs/GROUP_ARCHITECTURE.md §7; runbook in infra/evidence/README.md).
#
#   infra/evidence/capture.sh <command> [args]
#
# Read-only commands (write into evidence/s4-<date>/, which is gitignored):
#   precheck            credentials, whether a stack already exists, git state
#   outputs             stack outputs and physical resource IDs
#   events              stack events timeline and per-resource create durations
#   rds                 RDS settings, rds.force_ssl, subnet group
#   security            SG rules, S3/EBS/Secrets encryption, bucket policy, TLS policy
#   scaling             ASG settings, scaling policies and target-tracking alarms
#   sns                 SNS subscription status (must be confirmed before the failover test)
#   instance [id]       IAM and pg_stat_ssl checks on an instance via SSM Run Command
#   served-by [n]       n sequential requests (default 20), X-Served-By per line
#   history <label>     scaling activities, alarm history, RDS events, target health
#   probe <label>       start the request log (Ctrl-C stops it and prints the summary)
#   watch <label>       poll target health, ASG and alarm state every 10 s
#   load                k6 scale-out load: 90 req/s for 20 min (LOAD_RATE, LOAD_MIN)
#
# Commands that only PRINT the stack-changing commands (nothing is run):
#   plan-failover       stop one instance
#   plan-az             AZ-loss simulation for the AZ that holds the RDS primary
#
# Bash 3.2 compatible (macOS).
set -Eeuo pipefail
# shellcheck source=infra/evidence/env.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/env.sh"

save() { tee "$EVIDENCE_DIR/$1"; echo "evidence: saved $EVIDENCE_DIR/$1" >&2; }

# AWS ISO timestamps → local "HH:MM:SS" and epoch, for jq.
JQ_TIME='def epoch: sub("\\.[0-9]+"; "") | sub("\\+00:00$"; "Z") | fromdateiso8601;
def local: epoch | strflocaltime("%H:%M:%S");
def mmss: "+\(. / 60 | floor):\(. % 60 | tostring | if length < 2 then "0" + . else . end)";'

cmd_precheck() {
  echo "== $(ts)"
  aws sts get-caller-identity --query Arn --output text ||
    die "credentials don't work: paste fresh ones from the Lab's AWS Details panel"
  if aws cloudformation describe-stacks --stack-name "$STACK" --query 'Stacks[0].StackStatus' --output text 2>/dev/null; then
    echo "WARNING: stack $STACK already exists, so deploy.sh would UPDATE it and there is no fresh timeline."
  else
    echo "OK: no stack named $STACK (fresh account)"
  fi
  echo "Imported certificates in ACM:"
  aws acm list-certificates --query 'CertificateSummaryList[].[DomainName,Status,Type]' --output text
  local remote
  remote=$(git -C "$repo" ls-remote origin refs/heads/main | cut -f1)
  echo "origin main $remote, local HEAD $(git -C "$repo" rev-parse HEAD)"
  git -C "$repo" status --short
}

cmd_outputs() {
  load_stack
  {
    echo "== $(ts) stack $STACK"
    aws cloudformation describe-stacks --stack-name "$STACK" \
      --query 'Stacks[0].{Status:StackStatus,Created:CreationTime,Parameters:Parameters[?ParameterValue!=`****`]|[].[ParameterKey,ParameterValue]}' --output yaml
    aws cloudformation describe-stacks --stack-name "$STACK" \
      --query 'Stacks[0].Outputs[].[OutputKey,OutputValue]' --output table
    aws cloudformation describe-stack-resources --stack-name "$STACK" \
      --query 'StackResources[].[LogicalResourceId,ResourceType,ResourceStatus]' --output table
  } | save "outputs-$(stamp).txt"
}

cmd_events() {
  local json=$EVIDENCE_DIR/stack-events.json
  aws cloudformation describe-stack-events --stack-name "$STACK" --output json >"$json"
  {
    echo "== Stack events, oldest first (local time, elapsed since the first event)"
    jq -r "$JQ_TIME"'
      .StackEvents | sort_by(.Timestamp) | (.[0].Timestamp | epoch) as $t0 | .[] |
      [(.Timestamp | local), ((.Timestamp | epoch) - $t0 | mmss), .ResourceStatus, .LogicalResourceId,
       .ResourceType, (.ResourceStatusReason // "")] | @tsv' "$json" | column -t -s $'\t'
    echo
    echo "== Create duration per resource (start offset, duration), slowest first"
    jq -r "$JQ_TIME"'
      .StackEvents | (map(.Timestamp | epoch) | min) as $t0 |
      map(select(.ResourceType != "AWS::CloudFormation::Stack")) | group_by(.LogicalResourceId) | map({
        id: .[0].LogicalResourceId, type: .[0].ResourceType,
        start: (map(select(.ResourceStatus == "CREATE_IN_PROGRESS") | .Timestamp | epoch) | min),
        end: (map(select(.ResourceStatus == "CREATE_COMPLETE") | .Timestamp | epoch) | max)
      }) | map(select(.start != null and .end != null)) | sort_by(.start - .end) | .[] |
      [.id, .type, (.start - $t0 | mmss), (.end - .start | mmss)] | @tsv' "$json" | column -t -s $'\t'
    echo
    jq -r "$JQ_TIME"'
      .StackEvents | map(select(.ResourceType == "AWS::CloudFormation::Stack")) | sort_by(.Timestamp) |
      "Stack: \(.[0].ResourceStatus) \(.[0].Timestamp | local) → \(.[-1].ResourceStatus) \(.[-1].Timestamp | local), total \((.[-1].Timestamp | epoch) - (.[0].Timestamp | epoch) | mmss)"' "$json"
  } | save "stack-events-$(stamp).txt"
}

cmd_rds() {
  load_stack
  {
    echo "== $(ts) RDS $DB_ID"
    aws rds describe-db-instances --db-instance-identifier "$DB_ID" --query 'DBInstances[0].{
      Engine:Engine,EngineVersion:EngineVersion,Class:DBInstanceClass,Status:DBInstanceStatus,
      MultiAZ:MultiAZ,PrimaryAZ:AvailabilityZone,StandbyAZ:SecondaryAvailabilityZone,
      PubliclyAccessible:PubliclyAccessible,StorageType:StorageType,AllocatedStorageGiB:AllocatedStorage,
      StorageEncrypted:StorageEncrypted,KmsKeyId:KmsKeyId,CACertificate:CACertificateIdentifier,
      ParameterGroup:DBParameterGroups[0].DBParameterGroupName,SubnetGroup:DBSubnetGroup.DBSubnetGroupName,
      Subnets:DBSubnetGroup.Subnets[].[SubnetIdentifier,SubnetAvailabilityZone.Name],
      SecurityGroups:VpcSecurityGroups[].VpcSecurityGroupId,BackupRetentionDays:BackupRetentionPeriod,
      DeletionProtection:DeletionProtection,MasterUserSecret:MasterUserSecret.{Arn:SecretArn,Status:SecretStatus},
      Endpoint:Endpoint.Address}' --output yaml
    local group
    group=$(aws rds describe-db-instances --db-instance-identifier "$DB_ID" \
      --query 'DBInstances[0].DBParameterGroups[0].DBParameterGroupName' --output text)
    echo "Parameter group $group:"
    aws rds describe-db-parameters --db-parameter-group-name "$group" --source user \
      --query 'Parameters[].[ParameterName,ParameterValue]' --output table
    echo "Route tables of the DB subnets (no 0.0.0.0/0 route expected):"
    aws ec2 describe-route-tables \
      --filters "Name=association.subnet-id,Values=$(aws rds describe-db-instances --db-instance-identifier "$DB_ID" \
        --query 'join(`,`, DBInstances[0].DBSubnetGroup.Subnets[].SubnetIdentifier)' --output text)" \
      --query 'RouteTables[].Routes[].[DestinationCidrBlock,GatewayId,NatGatewayId,State]' --output table
  } | save "rds-$(stamp).txt"
}

cmd_security() {
  load_stack
  {
    echo "== $(ts) Security groups (inbound)"
    aws ec2 describe-security-groups --group-ids "$SG_ALB" "$SG_APP" "$SG_DB" --query 'SecurityGroups[].{
      Group:Tags[?Key==`Name`]|[0].Value,Id:GroupId,
      Inbound:IpPermissions[].[IpProtocol,FromPort,ToPort,join(`,`,IpRanges[].CidrIp),join(`,`,UserIdGroupPairs[].GroupId)],
      Outbound:IpPermissionsEgress[].[IpProtocol,FromPort,ToPort,join(`,`,IpRanges[].CidrIp),join(`,`,UserIdGroupPairs[].GroupId)]}' --output yaml
    echo "== HTTPS listener"
    aws elbv2 describe-listeners --load-balancer-arn "$LB_ARN" \
      --query 'Listeners[].[Protocol,Port,SslPolicy,DefaultActions[0].Type]' --output table
    echo "== S3 bucket $BUCKET"
    aws s3api get-bucket-encryption --bucket "$BUCKET" --output yaml
    aws s3api get-public-access-block --bucket "$BUCKET" --output yaml
    aws s3api get-bucket-versioning --bucket "$BUCKET" --output yaml
    aws s3api get-bucket-policy --bucket "$BUCKET" --query Policy --output text | jq .
    echo "== EBS root volumes of the app instances"
    local ids
    ids=$(aws autoscaling describe-auto-scaling-groups --auto-scaling-group-names "$ASG" \
      --query 'AutoScalingGroups[0].Instances[].InstanceId' --output text)
    # shellcheck disable=SC2086 # word splitting intended
    aws ec2 describe-volumes --filters "Name=attachment.instance-id,Values=$(echo $ids | tr ' ' ',')" \
      --query 'Volumes[].[Attachments[0].InstanceId,VolumeType,Size,Encrypted,KmsKeyId]' --output table
    echo "== Secrets"
    aws secretsmanager list-secrets --query 'SecretList[].[Name,KmsKeyId||`aws/secretsmanager (default)`,OwningService]' --output table
  } | save "security-$(stamp).txt"
}

cmd_scaling() {
  load_stack
  {
    echo "== $(ts) Auto Scaling group $ASG"
    aws autoscaling describe-auto-scaling-groups --auto-scaling-group-names "$ASG" --query 'AutoScalingGroups[0].{
      Min:MinSize,Max:MaxSize,Desired:DesiredCapacity,Subnets:VPCZoneIdentifier,HealthCheck:HealthCheckType,
      GracePeriod:HealthCheckGracePeriod,DefaultWarmup:DefaultInstanceWarmup,Suspended:SuspendedProcesses[].ProcessName,
      Instances:Instances[].[InstanceId,AvailabilityZone,LifecycleState,HealthStatus]}' --output yaml
    aws autoscaling describe-policies --auto-scaling-group-name "$ASG" --query 'ScalingPolicies[].{
      Name:PolicyName,Metric:TargetTrackingConfiguration.PredefinedMetricSpecification.PredefinedMetricType,
      Target:TargetTrackingConfiguration.TargetValue,Alarms:Alarms[].AlarmName}' --output yaml
    echo "== Alarms (target tracking creates a High and a Low alarm per policy)"
    aws cloudwatch describe-alarms --alarm-name-prefix "TargetTracking-$ASG" --query 'MetricAlarms[].{
      Name:AlarmName,Metric:MetricName,Op:ComparisonOperator,Threshold:Threshold,PeriodS:Period,
      Evaluate:EvaluationPeriods,DatapointsToAlarm:DatapointsToAlarm,State:StateValue}' --output table
    aws cloudwatch describe-alarms --alarm-names "$ALARM" --query 'MetricAlarms[].{
      Name:AlarmName,Metric:MetricName,Stat:Statistic,Op:ComparisonOperator,Threshold:Threshold,PeriodS:Period,
      Evaluate:EvaluationPeriods,Missing:TreatMissingData,State:StateValue}' --output table
  } | save "scaling-$(stamp).txt"
}

cmd_sns() {
  load_stack
  aws sns list-subscriptions-by-topic --topic-arn "$TOPIC_ARN" \
    --query 'Subscriptions[].[Protocol,SubscriptionArn]' --output table
  echo "(PendingConfirmation means the email link has not been clicked yet)"
}

cmd_instance() {
  load_stack
  local id=${1:-}
  if [[ -z $id ]]; then
    id=$(aws autoscaling describe-auto-scaling-groups --auto-scaling-group-names "$ASG" \
      --query 'AutoScalingGroups[0].Instances[?LifecycleState==`InService`] | [0].InstanceId' --output text)
  fi
  local params=$EVIDENCE_DIR/.ssm-params.json command
  jq -n --arg b64 "$(base64 <"$evidence_here/on-instance.sh" | tr -d '\n')" \
    '{commands: ["echo \($b64) | base64 -d > /tmp/s4-on-instance.sh && bash /tmp/s4-on-instance.sh; rm -f /tmp/s4-on-instance.sh"]}' >"$params"
  command=$(aws ssm send-command --instance-ids "$id" --document-name AWS-RunShellScript \
    --comment "S4 IAM and TLS evidence" --parameters "file://$params" \
    --query Command.CommandId --output text)
  echo "evidence: Run Command $command on $id, waiting…" >&2
  aws ssm wait command-executed --command-id "$command" --instance-id "$id" || true
  {
    aws ssm get-command-invocation --command-id "$command" --instance-id "$id" \
      --query '[Status,StandardOutputContent,StandardErrorContent]' --output text
  } | save "instance-$id-$(stamp).txt"
}

cmd_served_by() {
  load_stack
  local n=${1:-20} i
  {
    echo "== $(ts) $n requests to $APP_URL/ (curl -k: self-signed certificate)"
    for ((i = 1; i <= n; i++)); do
      printf '%s  #%-3s ' "$(date +%H:%M:%S)" "$i"
      curl -ksS -o /dev/null -D - "$APP_URL/" |
        awk 'NR == 1 { status = $2 } tolower($1) == "x-served-by:" { $1 = ""; served = $0 }
             END { printf "HTTP %s  X-Served-By:%s\n", status, served }' | tr -d '\r'
    done
  } | save "served-by-$(stamp).txt"
  echo "--- count per instance/AZ:"
  awk -F'X-Served-By: ' 'NF > 1 { count[$2]++ } END { for (k in count) print "  " count[k] "  " k }' \
    "$(ls -t "$EVIDENCE_DIR"/served-by-*.txt | head -1)"
}

cmd_history() {
  local label=${1:?usage: history <label>}
  load_stack
  {
    echo "== $(ts) $label"
    echo "--- Scaling activities (newest first, local time)"
    aws autoscaling describe-scaling-activities --auto-scaling-group-name "$ASG" --max-items 30 --output json |
      jq -r "$JQ_TIME"'.Activities[] | [(.StartTime | local), ((.EndTime // "") | if . == "" then "-" else local end),
        .StatusCode, .Description, (.Cause | gsub("\n"; " "))] | @tsv'
    echo
    echo "--- HealthyHostCount alarm state changes (oldest first)"
    aws cloudwatch describe-alarm-history --alarm-name "$ALARM" --history-item-type StateUpdate \
      --max-items 50 --output json |
      jq -r "$JQ_TIME"'.AlarmHistoryItems | sort_by(.Timestamp) | .[] | [(.Timestamp | local), .HistorySummary] | @tsv'
    echo
    echo "--- Target-tracking alarm state changes (oldest first)"
    local name
    for name in $(aws cloudwatch describe-alarms --alarm-name-prefix "TargetTracking-$ASG" \
      --query 'MetricAlarms[].AlarmName' --output text); do
      aws cloudwatch describe-alarm-history --alarm-name "$name" --history-item-type StateUpdate --max-items 20 --output json |
        jq -r "$JQ_TIME"'.AlarmHistoryItems | sort_by(.Timestamp) | .[] | [(.Timestamp | local), .AlarmName, .HistorySummary] | @tsv'
    done
    echo
    echo "--- RDS events, last 3 hours"
    aws rds describe-events --source-type db-instance --source-identifier "$DB_ID" --duration 180 --output json |
      jq -r "$JQ_TIME"'.Events[] | [(.Date | local), .Message] | @tsv'
    echo
    echo "--- Now: ASG instances and target health"
    aws autoscaling describe-auto-scaling-groups --auto-scaling-group-names "$ASG" \
      --query 'AutoScalingGroups[0].[MinSize,MaxSize,DesiredCapacity,VPCZoneIdentifier]' --output text
    aws autoscaling describe-auto-scaling-groups --auto-scaling-group-names "$ASG" \
      --query 'AutoScalingGroups[0].Instances[].[InstanceId,AvailabilityZone,LifecycleState,HealthStatus]' --output table
    aws elbv2 describe-target-health --target-group-arn "$TG_ARN" \
      --query 'TargetHealthDescriptions[].[Target.Id,TargetHealth.State,TargetHealth.Reason]' --output table
    aws rds describe-db-instances --db-instance-identifier "$DB_ID" \
      --query 'DBInstances[0].[DBInstanceStatus,AvailabilityZone,SecondaryAvailabilityZone]' --output text
  } | save "history-$label-$(stamp).txt"
}

cmd_probe() {
  local label=${1:?usage: probe <label>}
  load_stack
  exec node "$evidence_here/probe.mjs" "$APP_URL" "$EVIDENCE_DIR/probe-$label.tsv" "${PROBE_MS:-250}"
}

cmd_watch() {
  local label=${1:?usage: watch <label>}
  load_stack
  exec bash "$evidence_here/watch.sh" "$EVIDENCE_DIR/watch-$label.log"
}

cmd_load() {
  load_stack
  local rate=${LOAD_RATE:-90} minutes=${LOAD_MIN:-20}
  echo "evidence: k6 at $rate req/s for $minutes min (+1 min ramp) against $APP_URL" >&2
  echo "evidence: ignore k6's per-instance column; it assumes 2 instances" >&2
  cd "$EVIDENCE_DIR"
  STEPS=$rate STEP_MIN=$minutes RAMP_SEC=60 k6 run -e BASE_URL="$APP_URL" "$repo/infra/load/capacity.js" 2>&1 |
    tee "load-$(stamp).log"
}

cmd_plan_failover() {
  load_stack
  echo "In-service instances:"
  aws autoscaling describe-auto-scaling-groups --auto-scaling-group-names "$ASG" \
    --query 'AutoScalingGroups[0].Instances[].[InstanceId,AvailabilityZone,LifecycleState,HealthStatus]' --output table
  local id
  id=$(aws autoscaling describe-auto-scaling-groups --auto-scaling-group-names "$ASG" \
    --query 'AutoScalingGroups[0].Instances[?LifecycleState==`InService`] | [-1].InstanceId' --output text)
  cat <<EOF

NOT RUN. Stop one instance (here $id; any InService one works):

  echo "stop issued \$(date +%Y-%m-%dT%H:%M:%S%z)" | tee -a "$EVIDENCE_DIR/actions.log"; aws ec2 stop-instances --instance-ids $id

EOF
}

cmd_plan_az() {
  load_stack
  local primary lost_subnet keep_subnet ids
  primary=$(aws rds describe-db-instances --db-instance-identifier "$DB_ID" \
    --query 'DBInstances[0].AvailabilityZone' --output text)
  for subnet in "$APP_SUBNET_A" "$APP_SUBNET_B"; do
    if [[ $(aws ec2 describe-subnets --subnet-ids "$subnet" --query 'Subnets[0].AvailabilityZone' --output text) == "$primary" ]]; then
      lost_subnet=$subnet
    else
      keep_subnet=$subnet
    fi
  done
  [[ -n ${lost_subnet:-} && -n ${keep_subnet:-} ]] || die "could not map the app subnets to $primary"
  ids=$(aws autoscaling describe-auto-scaling-groups --auto-scaling-group-names "$ASG" \
    --query "AutoScalingGroups[0].Instances[?AvailabilityZone=='$primary'].InstanceId" --output text)
  echo "RDS primary is in $primary, so that is the AZ we 'lose' (the failover moves the primary out of it)."
  echo "App subnet in $primary: $lost_subnet; kept: $keep_subnet. Instances in $primary: ${ids:-none}"
  cat <<EOF

NOT RUN. Run the three back to back (within ~30 s), with probe and watch already running:

  echo "az-loss start \$(date +%Y-%m-%dT%H:%M:%S%z)" | tee -a "$EVIDENCE_DIR/actions.log"
  aws autoscaling update-auto-scaling-group --auto-scaling-group-name $ASG --vpc-zone-identifier $keep_subnet
  aws ec2 stop-instances --instance-ids $ids
  aws rds reboot-db-instance --db-instance-identifier $DB_ID --force-failover --query 'DBInstance.DBInstanceStatus'

Afterwards the stack has drifted (the ASG has one subnet). Don't re-run deploy.sh; the Lab Reset tears it down.
To undo by hand: aws autoscaling update-auto-scaling-group --auto-scaling-group-name $ASG --vpc-zone-identifier $APP_SUBNET_A,$APP_SUBNET_B
EOF
}

command=${1:-}
[[ -n $command ]] || { sed -n '2,25p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 2; }
shift
case $command in
  precheck | outputs | events | rds | security | scaling | sns | instance | history | probe | watch | load)
    "cmd_$command" "$@" ;;
  served-by) cmd_served_by "$@" ;;
  plan-failover) cmd_plan_failover ;;
  plan-az) cmd_plan_az ;;
  *) die "unknown command $command (run without arguments for help)" ;;
esac
