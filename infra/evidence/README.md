# S4 evidence run

Scripts and runbook for the design-document evidence in `docs/GROUP_ARCHITECTURE.md` §7. The video is a separate session and isn't covered here.

Every command writes into `evidence/s4-<date>/`. The 14 Nov run used the same AWS CLI calls typed directly and piped through `tee`, so the screenshots show the commands themselves; of the scripts here, only `probe.mjs` has run against AWS. `capture.sh`, `watch.sh` and `on-instance.sh` wrap the same calls but are untested against a live stack. That folder is gitignored because it holds the account ID, ARNs and the ALB DNS name. Times are local (Sydney) with the offset.

| Script | What it does |
| --- | --- |
| `capture.sh` | The entry point. Run it with no arguments for the command list. It only reads, apart from the `instance` Run Command, whose single write attempt is meant to be refused. `plan-failover` and `plan-az` only **print** the commands that change the stack. |
| `probe.mjs` | A request log on a fixed 250 ms schedule. It alternates `/api/health` (shallow) and `/api/games` (reads RDS) and records the status, latency and `X-Served-By` of each request. Ctrl-C prints failed/total, the failure windows, and when each instance was first and last seen. |
| `watch.sh` | Every 10 s: target health, ASG instances (AZ, lifecycle, health), desired capacity and the `HealthyHostCount` alarm state. |
| `on-instance.sh` | Runs on an instance through SSM Run Command. It shows LabRole being refused `ListBucket` and access outside `covers/` while it may read a cover, and it prints `pg_stat_ssl`. |

`probe` and `watch` each run in their own terminal tab, alongside the command that causes the change.

## Order

| # | Step | Commands | Screenshots / records |
| --- | --- | --- | --- |
| 0 | Before the deploy | Record the Lab credits. Paste credentials. `capture.sh precheck` (expect no stack) | Credits figure |
| 1 | Fresh deploy | **Changes AWS:** `infra/deploy.sh --disable-rollback` (~20–35 min; 20.5 min on 14 Nov). Confirm the SNS email. Then `capture.sh outputs`, `events`, `scaling`, `sns` | CloudFormation → stack → Events → **Timeline view**; the `CREATE_COMPLETE` status; the SNS confirmation page |
| 2 | Load distribution | `capture.sh served-by 20`. Then add one game with an **uploaded cover** in the browser (steps 3 and 6 need it) | Browser `https://` warning, then the app; the footer badge on two reloads showing different AZs; the terminal output |
| 3 | Refused S3 action | Browser: EC2 → instance → Connect → Session Manager, paste the block below. Then `capture.sh instance` for the full text log | The Session Manager window showing `AccessDenied` next to the allowed `head-object` |
| 4 | RDS settings | `capture.sh rds` (optionally `security`) | RDS console: Configuration (Multi-AZ, primary and secondary AZ), Connectivity (not publicly accessible, `db-sg`), storage encryption |
| 5 | Failover + alarm | Tab A `capture.sh probe failover`, tab B `capture.sh watch failover`. Then `capture.sh plan-failover` and run its stop command **after a yes**. Wait for the alarm to go to OK, stop both tabs, then `capture.sh history failover` | Alarm in ALARM, then OK (CloudWatch → Alarms → History); both emails; target group Targets tab during draining; the dashboard |
| 6 | Scale-out | Tab B `capture.sh watch scale`. Tab A `capture.sh load` (90 req/s for 20 min; with the probe's ~4 req/s, 2 instances get ~2,820 req/min each and 4 get ~1,410, between the 1,350 scale-in and 1,500 scale-out lines, so the group settles at 4 rather than pinning at max with its High alarm firing). **Ask first:** it costs a little data transfer | Dashboard: requests per target above the 1,500 line, in-service 2 → 4, p95 latency; ASG Activity tab; k6 summary |
| 7 | Scale-in | Keep `watch scale` **and the probe** running. The probe records that scale-in drops no requests; the group scales in without it, because with no traffic `RequestCountPerTarget` is published as 0 (S4 result 7). Wait for 4 → 2, then `capture.sh history scale` | ASG Activity tab (terminations); dashboard in-service falling back to 2 |
| 8 | AZ-loss simulation | Tabs A and B: `probe az` and `watch az`. `capture.sh plan-az`, then run its three commands **after a yes**. Afterwards `capture.sh history az`, `capture.sh rds` | RDS events (failover start and finish); ASG with one subnet; target group; second ALARM → OK; the dashboard |
| 9 | After the run | Record the credits, then Reset the Lab | Credits figure |

Session Manager paste block (step 3). The browser shell starts as `ssm-user`:

```bash
sudo -i
set -a; . /etc/game-library/stack.env; set +a
aws sts get-caller-identity --query Arn --output text
aws s3 ls "s3://$S3_BUCKET/"
aws s3api head-object --bucket "$S3_BUCKET" --key outside-covers.txt
key=covers/$(curl -s http://127.0.0.1:3000/api/games | grep -o '/api/covers/[^"]*' | head -1 | cut -d/ -f4)
aws s3api head-object --bucket "$S3_BUCKET" --key "$key" --query '[ContentType,ServerSideEncryption]'
```

## Notes

- **Credentials** last for the Lab session (about 4 h). If `watch` starts logging `ERR`, paste fresh credentials. `probe` doesn't use them.
- **Scale-in timing:** target tracking scales in only when every policy's Low alarm is in ALARM. `capture.sh scaling` shows how many datapoints each Low alarm needs. Read the figure from the Lab rather than assuming one.
- **AZ choice in step 8:** `plan-az` "loses" the AZ that currently holds the RDS primary, so the forced failover moves the primary *out* of the lost AZ. Losing the other AZ would move it into the dead one.
- **After step 8** the ASG has drifted from the template (one subnet). Don't re-run `deploy.sh`; the Lab Reset tears it down.
- **What the AZ simulation doesn't reproduce:** a real AZ outage also takes out that AZ's NAT gateway, ALB node and network. The doc has to say so (§7).
