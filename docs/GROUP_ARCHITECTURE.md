# Group Architecture: Game Library on a Scalable, Highly Available AWS Stack

Status: design locked 14 Nov 2026, not yet implemented. Due: Tuesday 17 Nov 2026, 4:00 pm (Sydney).

This document records what the group decided for the INFS3701 group assignment, why, and how the work is split into implementation sessions. It is the reference for every implementation session. Change it here first if a decision changes.

Sources:

- INFS3701 Group Assignment brief and marking scheme (Moodle, Assessments Hub)
- Course announcements up to 12 Nov 2026 and the Course Q&A forum (lecturer replies quoted as "Q&A" below)
- Wataru Takeda's individual assignment design document (the starting point)
- The group-approved architecture diagram (kept outside this repo)
- This repository at commit `bb49a9a`

## 1. Scope in one paragraph

We take **Option A**: scale up Wataru's individual service, Game Library, a Next.js app for tracking a personal game collection with IGDB autofill, Steam library import, cover uploads and JSON export. The individual version ran on one EC2 instance with SQLite on EBS. The group version runs **2–4 EC2 instances in an Auto Scaling group across two Availability Zones**, behind an **HTTPS Application Load Balancer**, with a **Multi-AZ RDS for PostgreSQL** data tier, covers in **S3**, credentials in **Secrets Manager**, and a **CloudWatch dashboard and alarm**. Everything is deployed by **one CloudFormation stack** and rebuilt from scratch every work session, because the Learner Lab is reset at the end of each session. **Auto Scaling is our only Going Further item.**

## 2. Requirements and how we meet them

| Requirement (brief / rubric) | How the design meets it | Evidence we will capture |
| --- | --- | --- |
| Distribute load across ≥2 instances behind a load balancer | ALB in front of an ASG (min 2) of t3.small instances (D5, D6) | `X-Served-By` header alternating in a curl loop; footer badge in the browser (D13) |
| Survive loss of an instance or an AZ; span ≥2 AZs | ASG and ALB span us-east-1a/1b; Multi-AZ RDS; one NAT gateway per AZ (D2, D6, D7) | Failover test and AZ simulation with request logs and recovery times (§7) |
| Built to scale out: stateless app tier, state in the data tier | No sessions or files on the instances; data in RDS, covers in S3; no stickiness (D5, D8) | Doc reasoning plus the scale-out test |
| Sound networking: public and private subnets, expose only what must be public | Only the ALB and NAT gateways sit in public subnets; app and DB subnets are private; DB subnets have no internet route (D2, D3) | Subnet and route table screenshots; RDS `PubliclyAccessible: false` |
| Resilient managed database | RDS for PostgreSQL, Multi-AZ (D7) | RDS console showing Multi-AZ; forced failover during the AZ simulation |
| Monitoring: dashboard + ≥1 alarm on a signal that matters, with evidence it fired | Dashboard (D12); `HealthyHostCount < 2` alarm → SNS email (D12) | Alarm in ALARM state, the email, and the return to OK during the failover test |
| Least-privilege IAM, tight security groups | LabInstanceProfile in the lab, with the intended least-privilege policy written out; bucket policy restricting LabRole; SG chain ALB → app → DB (D3, D9, D14) | Refused S3 action (e.g. ListBucket) from an instance; SG rules screenshot |
| Encryption in transit and at rest | HTTPS on the ALB (self-signed cert in ACM); RDS TLS enforced; S3 TLS-only policy; RDS, EBS, S3 and Secrets Manager encrypted at rest (D10, D11) | Browser on `https://`; `pg_stat_ssl` showing TLS; S3/RDS/EBS encryption settings |
| Usable interface | The existing Game Library UI, served over HTTPS | The live demo in the video |
| Going Further: automate the scaling | ASG target tracking on requests per target, threshold justified from measured capacity (D6) | Load test with scale-out graphs (in-service count, request count, latency) |
| Deliverables: design doc (<8 pages, <4,000 words, PDF), diagram (≤2 pages), 12-month cost estimate (≤2 pages, us-east-1, Pricing Calculator), video (≤2:30), cover sheet, individual contribution statements | See §9, session S5 | — |

Clarifications from the Q&A forum that shaped the design:

- **HTTPS:** browser → ALB must be HTTPS. A self-signed certificate imported into ACM is acceptable. The browser warning is fine if the doc explains why it appears and how production would avoid it.
- **Auto scaling:** it is Going Further, not core. The core only needs the app to be *built* to scale out. Auto scaling on its own can reach the top band if it is shown working and its thresholds are justified against the business need.
- **IAM:** using LabInstanceProfile is fine. The doc should describe the least-privilege roles as if this were a real account, and the video or app should demonstrate a refused action. This is core, not Going Further.
- **CloudFormation:** allowed, but it is not a Going Further topic. As evidence, show the AI prompts and the stack events timeline, and justify what is deployed.
- **AZ-loss simulation:** removing a subnet from the ASG, stopping an instance and forcing an RDS failover is accepted, provided we say what it does not reproduce and report failed requests and recovery times.
- **Format and evidence:** no run-sheet is needed. Key results go in the body; screenshots and graphs go in the appendix, which is marked when the body refers to it. The cover sheet, contribution statements, references and appendices don't count towards the 8 pages. "2 pages" means at most 2.
- **Learner Lab:** reset at the end of every session. Keep CloudWatch dashboard refresh at 5 minutes or more to save credits.

## 3. Architecture overview

```
Browser ──HTTPS 443──▶ ALB (public subnets 1a+1b, alb-sg, ACM self-signed cert; 80 → 301 → 443)
                         │ HTTP 80 (inside VPC)
                         ▼
          ASG: EC2 t3.small ×2–4 (private app subnets 1a+1b, app-sg, LabInstanceProfile)
          Nginx :80 ──▶ Next.js :3000 (systemd)
             │                │                    │                     │
             │ 5432 TLS       │ HTTPS via          │ HTTPS via NAT GW    │ HTTPS via NAT GW
             ▼                ▼ S3 gateway         ▼ (same AZ)           ▼
   RDS PostgreSQL Multi-AZ   endpoint: S3 bucket  Secrets Manager:      External APIs:
   (private DB subnets,      (covers/*)           RDS-managed secret,   IGDB, Steam Web API
    db-sg)                                        IGDB + Steam secrets  (+ GitHub/npm at boot)

CloudWatch dashboard + alarm (HealthyHostCount < 2) ──▶ SNS ──▶ email
```

Cover images: the browser requests `/api/covers/:id` from the ALB, and the app reads the object from S3 through the gateway endpoint and streams it back. The bucket is never public and the browser never talks to S3 directly.

## 4. Decisions and rationale

Each decision lists what we chose, why, and what we gave up. The numbered user answers from the design session are recorded at the end of this section.

### D1. Route and business framing

- **Decision:** Option A, Game Library. It stays a single-user app with no login, and the ALB is open to the internet.
- **Why:** it reuses a working app, so the effort goes into the architecture. Scaling is justified by bursty server-side work: a Steam library import enriches up to 20 games per request through IGDB and writes many records, and cover uploads are decoded and re-encoded with Sharp. These bursts are CPU- and latency-heavy and arrive unevenly. High availability is justified because personal records (status, ratings, reviews, playtime) cannot be re-downloaded from any external API, so losing the database or the only server loses the user's work.
- **Trade-off:** no authentication. Anyone who finds the URL can edit the library. That's accepted because the stack only exists during a work session (it is torn down by a Lab Reset afterwards) and holds no real personal data. The doc names Cognito-based sign-in as the production next step. Restricting the ALB to team IP addresses was rejected because it would not reflect how a real user reaches the service, and it complicates recording from different networks.

### D2. Network

- **Decision:**
  - VPC `10.0.0.0/16` in us-east-1 across us-east-1a and us-east-1b.
  - Public subnets `10.0.1.0/24` (1a) and `10.0.2.0/24` (1b): ALB and NAT gateways.
  - Private app subnets `10.0.11.0/24` (1a) and `10.0.12.0/24` (1b): EC2 instances.
  - Private DB subnets `10.0.21.0/24` (1a) and `10.0.22.0/24` (1b): RDS subnet group.
  - Internet Gateway. **One NAT gateway per AZ**, and each private app route table sends `0.0.0.0/0` to its own AZ's NAT.
  - DB subnets have **no route to the internet**.
  - **S3 gateway endpoint** attached to both app route tables. The endpoint policy stays at full access because Amazon Linux 2023 package repositories are served from S3 and a restrictive endpoint policy would break `dnf`. Bucket-side restriction is in D9.
- **Why:** matches the approved diagram and the three-tier pattern from Week 7. A NAT per AZ means losing one AZ doesn't cut the other AZ's instances off from Secrets Manager, IGDB or Steam. The gateway endpoint is free, keeps S3 traffic off the NAT (saving NAT data-processing charges), and lets the bucket policy require traffic from our VPC.
- **Trade-off:** two NAT gateways are the largest hourly cost in the stack (D15). A single NAT would halve that but reintroduce a single-AZ dependency.

### D3. Security groups and access

- **Decision:**
  - `alb-sg`: inbound 443 and 80 from `0.0.0.0/0`. Port 80 only redirects.
  - `app-sg`: inbound 80 from `alb-sg` only. Outbound 443 (AWS APIs, GitHub, npm, IGDB, Steam, package repos) and 5432 to `db-sg`.
  - `db-sg`: inbound 5432 from `app-sg` only.
  - **No SSH**: no port 22, no key pair. Shell access for debugging is SSM Session Manager (to be verified in the Lab, §6).
- **Why:** each tier accepts traffic only from the tier in front of it. Nothing on the instances or the database is reachable from the internet.
- **Trade-off:** if Session Manager turns out to be blocked in the Lab, debugging relies on the console's system log and `cloud-init-output.log` via the EC2 console, which is slower.

### D4. Compute and bootstrap

- **Decision:**
  - **Launch template:** latest Amazon Linux 2023 AMI (resolved from the SSM public parameter `/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64`), **t3.small**, LabInstanceProfile, IMDSv2 required, encrypted gp3 root volume (16 GiB), no key pair.
  - **No custom AMI.** User data stays small: it writes a non-secret env file and installs git, clones the public repo `github.com/muniuni/infs3701-game-library`, **checks out the pinned commit (`GitCommit` stack parameter)**, and runs `infra/bootstrap.sh` from the clone. The env file holds the bucket name, DB endpoint, secret ARNs, region, and instance ID/AZ from IMDSv2.
  - **Commit pinning:** `deploy.sh` resolves `main` to its current SHA at deploy time (`git ls-remote https://github.com/muniuni/infs3701-game-library.git refs/heads/main`) and passes it as `GitCommit`. Every deploy ships the latest `main` with no manual step, and every instance launched from that deploy, including scale-out and replacement instances, builds the same commit. A new SHA changes the launch template's user data, so the ASG rolls instances onto it through an `AutoScalingRollingUpdate` update policy (min 2 in service while it rolls).
  - `bootstrap.sh` installs Node.js and Nginx and runs `npm ci` and `npm run build`. It downloads the RDS CA bundle, runs `prisma migrate deploy` through the DB wrapper (D8), and installs and starts the systemd units. It then signals CloudFormation with `cfn-signal`.
  - **systemd instead of PM2:**
    - `game-library.service` runs Next.js on `127.0.0.1:3000`.
    - `game-library-cleanup.timer` runs the cover cleanup (D16).
  - **Nginx kept** (it's in the approved diagram). It listens on 80, proxies to `127.0.0.1:3000`, and forwards the ALB's `X-Forwarded-Proto` (`$http_x_forwarded_proto`, not `$scheme`). It also sets `client_max_body_size 6m` and `proxy_read_timeout 180s`, and adds `X-Served-By: <instance-id> <az>` to every response.
  - **Redeploying** new code means pushing to `main` and re-running `deploy.sh`. The new SHA triggers the rolling update.
  - **Consistent build ID across instances:** `next.config.ts` sets `generateBuildId` to the commit SHA (`git rev-parse HEAD`, exported by `bootstrap.sh`). Without this, every instance's independent `next build` gets a random build ID. Pages from one instance would then request `/_next/static/...` assets that another instance doesn't have, causing 404s and failed client navigations once the ALB alternates requests. The repo has no server actions (`"use server"`), so no shared `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` is needed. Add one as a stack-generated secret if server actions are ever introduced.
- **Why:** with no AMI and a full rebuild every session, building from source at boot is the only way to get the app onto instances. Keeping the bootstrap logic in the repo keeps the template small and lets the script be versioned and reviewed like code. systemd is already on the AMI and handles restarts and boot ordering without PM2's `startup`/`save` steps. Deploying the latest `main` suits a repo where Wataru is the only person pushing, and pinning its SHA at deploy time keeps the whole fleet on one build.
- **Trade-off:**
  - Each new instance takes several minutes from launch to healthy, because `npm ci` and the Next.js build run on a t3.small. This is the key constraint on scaling (D6).
  - Instances building different commits would break pages across the ALB even with a fixed build ID, because chunk hashes differ. Pinning the SHA prevents this; during a rolling update both commits briefly serve together, so avoid redeploying while recording evidence.
  - Pushing to `main` has no effect on a running stack until `deploy.sh` is re-run.

### D5. Application Load Balancer and HTTPS

- **Decision:**
  - Internet-facing ALB in both public subnets.
  - **Listener 443:** HTTPS with the imported ACM certificate and a TLS 1.2/1.3 security policy (`ELBSecurityPolicy-TLS13-1-2-2021-06`), forwarding to the target group.
  - **Listener 80:** a 301 redirect to 443.
  - **Target group:** HTTP:80 to the instances.
    - Health check `GET /api/health`: a new shallow endpoint that returns 200 without touching the database.
    - Interval 15 s, healthy threshold 2, unhealthy threshold 2, timeout 5 s.
    - Deregistration delay 30 s. Stickiness off.
  - ALB idle timeout **180 s**, so long Steam enrichment requests are not cut off at the default 60 s.
- **Why:** HTTPS is required for the part that crosses the internet (Q&A). The health check is shallow so that an RDS failover (D7) doesn't mark *every* instance unhealthy at once and leave the ALB with no targets. The short deregistration delay and health-check settings make failover measurably quick, which is what the failover test reports.
- **Trade-off:**
  - Traffic from the ALB to the instances is plain HTTP inside the VPC, in private subnets restricted by security groups. That is common practice. The production option is TLS to the targets.
  - The certificate is self-signed, so browsers warn (D10).
  - A shallow health check won't detect an instance that has lost its DB connection. The alarm and dashboard cover DB health instead.

### D6. Auto Scaling (Going Further)

- **Decision:**
  - **Sizes:** min **2**, desired **2**, max **4**, in the two private app subnets.
  - **Health checks:** ELB. Health-check grace period and default instance warmup are set from the **measured** boot-to-healthy time; the placeholder is 900 s until measured.
  - **Group metrics:** collection enabled, which is free at 1-minute granularity.
  - **Stack creation:** a `CreationPolicy` on the ASG waits for `cfn-signal` from the two initial instances (timeout 25 min). Stack `CREATE_COMPLETE` therefore means the app is actually serving.
  - **Scaling policy:** **target tracking on `ALBRequestCountPerTarget`.** The target value is about **half of one t3.small's measured capacity** (requests per minute). It is a stack parameter, measured in the first AWS session (S3, §9).
- **Why:**
  - **Metric:** request count per target tracks user demand directly and can be triggered on purpose with a load tool for the video. CPU is distorted by the build at launch and by t3 burst credits.
  - **Target at about half capacity:** a new instance takes minutes to build and pass health checks, so the group has to start scaling while the current instances still have headroom. If the target were near full capacity, the existing instances would saturate before the new ones were ready.
  - **Min 2 across 2 AZs:** this is the availability floor. One instance per AZ survives the loss of either.
- **How capacity is measured:**
  - Hold the group at 2 instances: set min = max = 2 for the measurement deploy, or suspend the scaling processes.
  - Ramp load through the ALB with a load tool that accepts the self-signed certificate (e.g. k6 with `insecureSkipTLSVerify`). Use a realistic mix: the library page, `/api/games`, and a cover.
  - Find the rate at which p95 latency exceeds ~1 s, errors appear, or CPU is sustained above ~80%.
  - Per-instance capacity = that sustained rate ÷ 2. Record the numbers for the doc.
- **Trade-off:** ALB request count treats all requests as equal, so a few heavy Steam imports can overload an instance without many requests. That's accepted and documented. Step scaling was rejected as more to tune for no benefit here.

### D7. Database: RDS for PostgreSQL, Multi-AZ

- **Decision:**
  - **Instance:** RDS for PostgreSQL (newest major version offered for `db.t3.micro`), **Multi-AZ**, 20 GiB gp3, storage encrypted (AWS-managed KMS key), `PubliclyAccessible: false`, DB subnet group on the DB subnets, `db-sg`.
  - **Password:** **`ManageMasterUserPassword: true`**, so RDS creates and owns the master password secret in Secrets Manager.
  - **TLS:** a custom parameter group with `rds.force_ssl = 1`. The app connects with `sslmode=verify-full` using the RDS CA bundle downloaded at boot.
  - **Backups:** retention 1 day. Deletion protection off, and `DeletionPolicy: Delete` with no final snapshot, because the lab is wiped every session anyway.
  - **Migrations:** every instance runs `prisma migrate deploy` at boot. Prisma Migrate takes a PostgreSQL advisory lock, so two instances booting together apply the migration only once (to be verified, §6).
- **Why:** the brief requires a resilient managed database, and the individual design already named RDS as the upgrade path once there are multiple app servers. SQLite on an EBS volume can't be shared by several instances or survive an AZ loss. PostgreSQL fits the existing relational Prisma model (unique constraints and transactions) with minimal change. Multi-AZ keeps a synchronous standby in the other AZ with automatic failover. With RDS-managed passwords, no human ever sees or types the DB password.
- **Trade-off:**
  - Multi-AZ doubles the DB cost.
  - Creation takes ~15–25 minutes, which dominates rebuild time.
  - The standby serves no reads.
  - The managed secret rotates automatically (every 7 days by default), and the app only reads it at start-up. A rotation would break new connections until the service restarts. That never happens within one lab session, but the doc names the production fix: re-read the secret and reconnect on authentication failure.

### D8. Data-tier code changes (consequences of D7)

- **Decision:**
  - **Prisma provider:** switch from `sqlite` to `postgresql`, using `@prisma/adapter-pg` and `pg`. `Game.data` becomes `jsonb`.
  - **Migrations:** replace the SQLite migration history with a fresh PostgreSQL baseline migration. There is no data to migrate, since every rebuild starts empty.
  - **Remove the SQLite/EBS guards:**
    - In `scripts/storage-config.mjs` and `scripts/check-storage.mjs`, drop the `file:` URL requirement, the EBS mount checks and `EBS_VOLUME_UUID`.
    - `STORAGE_MODE` keeps only its role of choosing local vs S3 covers. Its values are renamed from `local | ebs` to **`local | s3`**, with `s3` the production default, so the env file written by `bootstrap.sh` sets `STORAGE_MODE=s3` (decided in S1).
    - `DATABASE_URL` must be a `postgresql://` URL. Outside production it defaults to the Docker database; in production it has no default, so an instance can never fall back to a local database.
  - **Repository class:** rename `src/lib/sqlite-game-repository.ts` to a Prisma repository. Its transaction logic stays as it is.
    - **Isolation level (noted in S1):** SQLite ran one write at a time, while PostgreSQL defaults to Read Committed. With several instances, two concurrent edits of the same game resolve as last write wins. That is accepted for a single-user app and is not changed.
    - **Duplicate-error fix (S1):** only unique violations on `Game` identity columns map to the user-facing duplicate messages. When a retry of the same Steam import runs concurrently on two instances, the losing attempt now finds the committed receipt and returns that game. Before, it reported "A game with this title already exists".
  - **DB wrapper:** a small Node wrapper (e.g. `scripts/with-database-url.mjs`) reads the RDS-managed secret with the AWS SDK. It builds `DATABASE_URL` in memory (URL-encoding the password, adding `sslmode=verify-full` and the CA path) and then runs the given command. Both `prisma migrate deploy` and `next start` run through it, so the password is never written to disk or into user data.
  - **Local development:** PostgreSQL in Docker via `compose.yaml`. `.env.example` is updated, and tests that used a real SQLite file run against the local Postgres.
- **Why:** one Prisma schema can only target one database provider, and production must be PostgreSQL. Docker is already installed for local dev. Keeping the credentials out of files matches the individual assignment's secrets-handling stance.
- **Trade-off:** local development and tests now need Docker running.

### D9. Object storage (S3) and the bucket policy

- **Decision:**
  - **Bucket:** name generated by CloudFormation (no fixed name, so no collisions across rebuilds). Block Public Access on, default SSE-S3 encryption, object ownership "bucket owner enforced".
  - **Versioning:** enabled, with a lifecycle rule expiring noncurrent versions under `covers/` after 14 days (carried over from the individual assignment).
  - **Bucket policy:**
    - Deny every request that is not over TLS (`aws:SecureTransport = false`).
    - **For the `LabRole` principal only** (the role the instances use):
      - Deny any object outside `covers/*`.
      - Deny any action other than `s3:GetObject`, `s3:PutObject` and `s3:DeleteObject`.
      - **Deny any request that doesn't arrive through our S3 gateway endpoint** (`aws:SourceVpce`).
    - The console and CLI roles are not affected, so we can still browse the bucket in the console.
  - **Cover delivery:** covers stay proxied through `/api/covers/:id`, as the app already does.
- **Why:** this carries over the individual assignment's least-privilege bucket policy (the Week 4/5 Capital One lesson) and tightens it. Even with the instance credentials, the bucket can only be used from inside our VPC. Proxying keeps the bucket fully private and needs no code change.
- **Trade-off:** with no presigned URLs, every cover passes through the app. That's acceptable at this scale, and the doc names presigned URLs or CloudFront as the next step.

### D10. Secrets and the HTTPS certificate

- **Decision:**
  - **Three secrets:**
    - The RDS-managed master secret (D7).
    - IGDB credentials (`IGDB_CLIENT_ID`, `IGDB_CLIENT_SECRET`).
    - The Steam key (`STEAM_WEB_API_KEY`).
  - **How the IGDB and Steam secrets are created:**
    - The stack creates them from **`NoEcho` parameters** and lets CloudFormation generate their names, which avoids clashes with secrets still pending deletion after a Reset.
    - The stack passes their ARNs to the app through the env file.
    - `src/lib/server-secrets.ts` reads the secret IDs from environment variables (e.g. `IGDB_SECRET_ID`, `STEAM_SECRET_ID`) instead of its hard-coded `infs3701/game-library/*` names. The old names stay as local defaults.
  - **Where the secret values come from:** a gitignored file, `infra/deploy.env`, holds the IGDB and Steam values and the **alert email address** (D12). It is read only by `infra/deploy.sh`. A committed `infra/deploy.env.example` shows the keys with no values.
  - **HTTPS certificate:** `deploy.sh` generates a self-signed certificate with `openssl`, imports it into ACM (`aws acm import-certificate`) and passes the ARN to the stack. CloudFormation can't import certificates itself.
- **Why:** the template is in a public repo, so secret values must never be in it, and the Lab wipes secrets at every reset. One local file plus one script makes every rebuild a single command.
- **Trade-off:** the browser shows a certificate warning. The doc explains that a self-signed certificate isn't issued by a trusted authority, and that production would use a Route 53 domain with an ACM DNS-validated certificate. NoEcho parameters appear in the local `aws` command line while the script runs, which is acceptable on a personal Mac.

### D11. Encryption at rest

- **Decision:** all at rest encryption uses AWS-managed keys: RDS storage (`aws/rds`), EBS root volumes (`aws/ebs`), S3 (SSE-S3), and Secrets Manager (`aws/secretsmanager`).
- **Why:** this meets the core requirement at no extra cost.
- **Trade-off:** customer-managed KMS keys aren't used. That is not a Going Further item for us.

### D12. Monitoring: dashboard and alarm

- **Decision:**
  - **Dashboard:** one CloudWatch dashboard defined in the stack, with these widgets:
    - ALB: `RequestCount`, `TargetResponseTime` (p95), `HTTPCode_Target_5XX_Count`, `HTTPCode_ELB_5XX_Count`, `HealthyHostCount`, `UnHealthyHostCount`.
    - ASG: `GroupInServiceInstances`, `GroupDesiredCapacity`.
    - EC2: `CPUUtilization` aggregated by ASG.
    - RDS: `CPUUtilization`, `DatabaseConnections`, `FreeStorageSpace`.
    - The dashboard's auto-refresh stays at 5 minutes or more.
  - **Alarm:** target group `HealthyHostCount < 2`, statistic Minimum, period 60 s, 2 of 2 datapoints, missing data treated as breaching. It sends both ALARM and OK notifications to an **SNS topic with an email subscription**.
  - **Alert email:** Wataru's address, read from the gitignored `infra/deploy.env` and passed as a `NoEcho` parameter, so it never appears in the repo. The subscription has to be confirmed from the email after every rebuild.
- **Why:** fewer than two healthy targets means the service has lost its redundancy. That is the signal that matters for an HA design, and it fires naturally during the failover test. The ASG then replaces the instance and the alarm returns to OK, which shows detection and self-healing in one test.
- **Trade-off:** a 5xx-rate alarm was considered and not chosen. One alarm on the HA signal is enough for the core, and 5xx and latency stay visible on the dashboard. (Target tracking creates and manages its own two alarms as well.)

### D13. Showing which instance served a request

- **Decision:**
  - Every response carries an **`X-Served-By: <instance-id> <az>`** header, added by Nginx.
  - The page shows a small **footer badge** with the instance ID and AZ. The page reads these from environment variables written at boot from IMDSv2, so it must render per request.
  - `/api/health` is the shallow health endpoint (D5).
- **Why:** the video must show requests served by different instances or AZs. The badge is visible in the browser, and a curl loop over the header produces a clean log for the appendix and the failover test.
- **Trade-off:** it's a small UI change that's useful only for operations. The badge is styled to stay unobtrusive.

### D14. Identity and access (IAM)

- **Decision:**
  - **In the lab:** the instances use **LabInstanceProfile**, because the Learner Lab blocks creating IAM roles.
  - **In the design document**, written as for a real AWS account, the intended instance role allows only:
    - `secretsmanager:GetSecretValue` on the three secret ARNs.
    - `s3:GetObject`, `s3:PutObject` and `s3:DeleteObject` on `arn:aws:s3:::<bucket>/covers/*`.
    - The SSM managed-instance core permissions (for Session Manager).
    - `cloudformation:SignalResource` on this stack.
  - **Demonstration:** the bucket policy (D9) enforces part of this. Show a refused action, e.g. `s3:ListBucket` or a read outside `covers/`, from an instance via Session Manager, as in the Week 5 tutorial.
- **Why:** the Q&A said to write the doc as if we had a real account and to simulate and test the expected behaviour. The doc shouldn't mention Learner Lab limits.
- **Trade-off:** inside the lab, the shared LabRole is still broader than the designed policy outside the bucket.

### D15. Cost control and the deploy workflow

- **Decision:**
  - **Files:**
    - `infra/game-library.yaml`: a **single CloudFormation stack, written in YAML**.
    - `infra/deploy.sh`.
    - `infra/bootstrap.sh`.
    - `infra/deploy.env.example`.
    - `infra/deploy.env` (gitignored; add it to `.gitignore` in S3).
  - **Where it runs:** from Wataru's Mac, using the temporary credentials from the Learner Lab's "AWS Details" panel, pasted in each session. It also works from any group member's Mac with their own Lab credentials, in case credits run low.
  - **What `deploy.sh` does:**
    1. Check that the credentials work (`aws sts get-caller-identity`), and resolve `main` to its current SHA for the `GitCommit` parameter (D4).
    2. Generate and import the certificate.
    3. Run `aws cloudformation deploy` with the parameters from `deploy.env`. Pass `--disable-rollback` while debugging, so a failed first boot can be inspected rather than torn down.
    4. Print the HTTPS URL.
  - **Teardown:** a Lab **Reset** at the end of every session.
  - **Credits:** check the balance at the start and end of every session and record it for the cost section.
- **Why:** one command per session makes the frequent rebuilds safe and repeatable, and the Reset guarantees nothing keeps charging between sessions.
- **Trade-off:** each rebuild costs ~25–35 minutes of waiting, mostly Multi-AZ RDS creation and the app build. Plan sessions around that.

### D16. Smaller defaults

- **Demo data:** start with an empty library every rebuild. Games are added live in the video (search IGDB, add a game, upload a cover). No seed step.
- **Cover cleanup:** each instance runs the existing cleanup (`npm run covers:cleanup`) from a systemd timer every 5 minutes, through the DB wrapper. Concurrent runs on several instances are harmless: S3 deletes are idempotent and the ledger delete is conditional.
- **Steam import:** keep it and restore the API routes. In the working tree, `src/app/api/steam/{preview,enrich,import}/route.ts` show as deleted, but the deletion was never committed: the files exist in `HEAD` (added in `fe1218b`), there is no stash, and `src/components/steam-import.tsx` and `tests/e2e/steam.spec.ts` still call those routes. It looks accidental (the folder was last changed on 16 Oct). Restored in S1 (14 Nov); all 7 Steam e2e tests passed on SQLite before the port and on PostgreSQL after it.
- **Known limitation, IGDB pacing:** the 260 ms spacing between IGDB calls is enforced per process, so with N instances the combined rate can reach N times the single-instance rate and IGDB may return 429s. These are retried once and then reported to the user. The production fix is a shared rate limiter, e.g. a token bucket in a shared store. Documented, not built.

### Answers recorded from the design session

| # | Question | Answer |
| --- | --- | --- |
| 1 | Which commit do instances build? | **Latest `main`, pinned to its SHA at deploy time.** First answered "track `main`" (Wataru is the only one pushing); changed to pinning after finding that mixed commits break page loads across instances. `deploy.sh` resolves the SHA and passes it as `GitCommit` (D4). The repo is public, so no deploy token is needed. |
| 2 | API keys after each reset | **`deploy.sh` reads a gitignored file and passes NoEcho parameters; the stack creates the secrets** (D10) |
| 3 | Where to deploy from | **Wataru's Mac with Learner Lab credentials. The template is YAML.** (D15) |
| 4 | Scaling policy | **Target tracking on requests per target. Measure one t3.small's capacity in the first AWS session and set the target at about half, because new instances take minutes to build and scaling must start early** (D6) |
| 5 | Steam import | **Keep it and restore the routes.** Git suggests an accidental deletion (D16) |
| 6 | Demo data | **Start empty, add games live** (D16) |
| 7 | Show which instance served | **Footer badge plus `X-Served-By` header** (D13) |
| 8 | Alarm | **`HealthyHostCount < 2` → SNS email to Wataru. The address comes from the same gitignored file as the keys and is passed as a parameter** (D12) |
| 9 | Access and framing | **Single user, open ALB, documented. Scaling justified by import/enrichment/image bursts, HA by irreplaceable personal records** (D1) |
| 10 | S3 gateway endpoint | **Yes. Restrict to the endpoint for LabRole only, so the console still works** (D2, D9) |

## 5. Cost and credits

**Hourly cost while the stack runs** (us-east-1 on-demand, approximate):

| Item | Approx. per hour |
| --- | --- |
| 2 NAT gateways ($0.045 each, plus data processing) | $0.09 |
| ALB (hourly plus ~1 LCU) | $0.03 |
| 2 × t3.small ($0.0208 each), up to 4 during scale-out | $0.04–0.08 |
| RDS db.t3.micro Multi-AZ, plus 20 GiB gp3 in both AZs | $0.04 |
| 4 public IPv4 addresses (2 NAT EIPs, 2 ALB) at $0.005 | $0.02 |
| EBS roots, Secrets Manager, S3, CloudWatch, SNS | < $0.01 |
| **Total** | **≈ $0.22–0.27** |

**Credits:** $24.20 of $50 used as of 14 Nov, so **$25.80 left**. The plan is at most **5 AWS sessions of about 3 hours** (≈ $4–5 including build CPU on t3 burst credits). That leaves a buffer for a re-record. Before trusting this table, compare it with the Lab budget after the first session. If spending is higher than predicted, find the cause before redeploying (announcement, 11 Nov).

**Line items for the 12-month estimate** (Pricing Calculator, us-east-1, 730 h/month; build in S5):

- 2 NAT gateways with data processed (assume a few GB/month).
- ALB with LCU assumptions.
- EC2: 2 × t3.small always on, plus an assumption for scale-out hours (e.g. 2 extra instances for 30 h/month), and gp3 root volumes.
- RDS: db.t3.micro Multi-AZ, 20 GiB gp3, backup storage within the free allowance.
- 4 public IPv4 addresses.
- Secrets Manager: 3 secrets plus API calls.
- S3: Standard, ~1 GB including old versions, requests.
- CloudWatch: 1 dashboard, 3 alarms (1 HA alarm plus 2 created by target tracking), and metrics.
- SNS email notifications.
- Data transfer out.
- The ACM imported certificate and the S3 gateway endpoint are free; say so.

Rough order of magnitude: **~$170/month**, with the NAT gateways the largest share. The doc should tie each figure to the architecture and relate it to the US$50 Learner Lab credit and the credits actually used (individual-assignment feedback).

## 6. Unknowns to verify in the first AWS session

| Unknown | How to check | Fallback if it fails |
| --- | --- | --- |
| `ManageMasterUserPassword` works under the Lab role | Stack creates the DB and the `rds!…` secret | Stack-generated secret (`AWS::SecretsManager::Secret` with `GenerateSecretString`) used through a dynamic reference |
| SSM Session Manager works with LabInstanceProfile | Start a session to an instance | EC2 console system log; temporarily log bootstrap output to CloudWatch Logs |
| `cfn-signal` is available and allowed on AL2023 | `dnf install aws-cfn-bootstrap`; stack reaches `CREATE_COMPLETE` | Drop the CreationPolicy and rely on target health |
| Boot-to-healthy time | Timestamps in `cloud-init-output.log` and target health | Tune grace/warmup; if far too slow, consider building once and sharing the build output via S3 (needs a group decision) |
| Prisma advisory lock with 2 instances migrating together | Both instances boot cleanly; `_prisma_migrations` has one row per migration | Only the first instance migrates (e.g. a lock row), or migrate from `deploy.sh` |
| Single t3.small capacity | Load test (D6) | — (this sets the scaling target) |
| RDS offers the PostgreSQL major version used locally (18) on `db.t3.micro` | `aws rds describe-orderable-db-instance-options --engine postgres --engine-version 18.4 --db-instance-class db.t3.micro` | Use the newest major that is offered, and change `compose.yaml` to match |
| Template size within the 51,200-byte inline limit | `aws cloudformation validate-template` | Upload the template to an S3 bucket first |
| Secrets after a Reset | Second rebuild succeeds | Generated names already avoid clashes (D10) |
| Node.js version on AL2023 | `dnf list nodejs*` | Install via `nvm` |
| Pages work across instances (consistent build ID, D4) | Load one page's HTML, then fetch every `/_next/static/...` URL it references many times through the ALB. None may return 404 | Fix `generateBuildId`; check that both instances built the same SHA |
| DB TLS settings accepted by both Prisma Migrate and the `pg` adapter | `prisma migrate deploy` and the app both connect with RDS `force_ssl=1` | The wrapper builds a separate migrate URL in Prisma's TLS syntax (`sslmode=require&sslcert=<ca>&sslaccept=strict`) and passes `ssl: { ca, rejectUnauthorized: true }` to the adapter in code. Test this locally first against a TLS-enabled Docker Postgres in S2, so the first test isn't in a paid session. **S2 result (14 Nov, TLS-only Docker Postgres 18, self-signed CA):** the fallback is required. Prisma's engine treats `sslmode=verify-full` as no verification (it connected with a decoy CA), accepts any certificate unless `sslaccept=strict` is set, and can't read a multi-certificate bundle. A URL `sslmode` in node-postgres replaces the `ssl` object passed in code. Implemented: no TLS parameters in `DATABASE_URL`; TLS from `DATABASE_CA_FILE` (pg in code, Prisma in its own syntax); `infra/select-db-ca.sh` picks the single CA that verifies the endpoint. Migrate and app both pass with the right CA and fail with a decoy CA or a host-name mismatch |
| The RDS regional bundle contains a CA that verifies the endpoint on its own (the server sends its intermediate) | `infra/select-db-ca.sh` succeeds in `cloud-init-output.log`; `SELECT ssl FROM pg_stat_ssl` is true | Pin `CACertificateIdentifier` and fetch that CA's intermediate as well; or append intermediates to the selected file |

## 7. Evidence plan (doc appendix and video)

Capture each item with a timestamp and refer to it from the body of the design document.

1. **Build:** the AI prompts used, and the CloudFormation events timeline for a successful stack.
2. **HTTPS:** the browser at `https://<alb-dns>` showing the self-signed warning, then the working app.
3. **Load distribution:**
   - A curl loop showing `X-Served-By` alternating between two instances in different AZs.
   - The footer badge changing between reloads.
4. **Auto scaling (Going Further):**
   - The load test raises requests per target above the target, and the group scales from 2 to 3–4.
   - Dashboard graphs of request count, in-service instances and latency.
   - The group scales back in after the load stops.
   - Report the thresholds and timings.
5. **Failover test:**
   - Run steady traffic with a timestamped request log and stop one instance.
   - Report the number of failed requests out of the total, how long until the ALB stopped routing to it, and how long until the ASG replacement was healthy.
   - Explain why failures are not zero: in-flight requests and the health-check detection window.
6. **Alarm:** `HealthyHostCount < 2` goes to ALARM during the failover test, the email arrives, and the alarm returns to OK after replacement.
7. **AZ-loss simulation:**
   - Remove the 1a subnet from the ASG, stop the 1a instance, and reboot RDS with failover.
   - Report failed requests and recovery times.
   - State what this doesn't reproduce: a real AZ outage also takes out the NAT gateway, the ALB node and the network in that AZ.
8. **Security:**
   - A refused S3 action from an instance.
   - SG rules screenshot.
   - RDS not publicly accessible.
   - `SELECT ssl, version FROM pg_stat_ssl` showing TLS.
   - Encryption settings for S3, RDS and EBS.
9. **Cost:** Lab credit balance before and after each session.

Video (≤ 2:30): live URL in the browser → add a game with IGDB autofill and a cover → footer badge / `X-Served-By` alternating → stop an instance and keep using the app (alarm email) → scale-out graph → key decisions in our own words. Record while the stack runs, before the Reset.

## 8. Diagram changes (diagram lives outside the repo)

The approved diagram stays as the base. Make these changes in the original file:

- **Label every arrow** with protocol and purpose, e.g. "HTTPS 443", "HTTP 80 (health check /api/health)", "PostgreSQL 5432 TLS", "GetSecretValue (HTTPS)", "Get/Put/Delete covers/* via gateway endpoint", "Metadata lookup / Steam import (HTTPS via NAT)", "Outbound via NAT".
- **Add:**
  - The **Auto Scaling group** box spanning both private app subnets (min 2 / max 4).
  - The **ACM certificate** on the ALB, with listeners 443 and 80 → 443.
  - **CloudWatch** (dashboard and alarm) → **SNS** → email.
  - The **S3 gateway endpoint** on the app route tables.
  - The RDS-managed secret inside Secrets Manager.
  - The **Multi-AZ standby** shown in the second AZ.
- **Show the cover request path:** browser → ALB → app → S3, and the response back.
- Keep it to at most 2 pages, with AWS icons, and the AZs, request distribution and data tier visible at a glance.

## 9. Implementation sessions

Each session is a separate Claude Code session that starts by reading this document. Sessions S1 and S2 use no AWS credits.

**Commits and pushes are done by Wataru, never by Claude.** Each session ends by telling Wataru what to commit and whether to push. A push is required whenever instances need the new code. They clone from GitHub, and `deploy.sh` pins whatever `main` points to (D4). So everything that runs on an instance (app code, `infra/bootstrap.sh`, systemd and Nginx files) must be pushed **before** running `deploy.sh`. The template, `deploy.sh` and `deploy.env` run from the local Mac and don't need a push to take effect.

### S1. Data tier port and Steam restore (no AWS)

- [x] `git restore src/app/api/steam` and confirm the Steam e2e tests pass on SQLite before changing anything else.
- [x] Add `compose.yaml` with PostgreSQL (the same major version as RDS) for local dev and tests. Uses `postgres:18`; confirming that RDS offers 18 on `db.t3.micro` is a §6 row for S3.
- [x] Switch `prisma/schema.prisma` to `postgresql`. Replace `prisma/migrations/` with a fresh Postgres baseline migration (`20261114000000_postgres_baseline`).
- [x] Replace `@prisma/adapter-better-sqlite3` with `@prisma/adapter-pg` and `pg` in `src/lib/database.ts`.
- [x] Remove the `file:`/EBS guards from `scripts/storage-config.mjs`, `scripts/check-storage.mjs` and `scripts/migrate.mjs`. `STORAGE_MODE` only selects local vs S3 covers, now `local | s3` (D8). `scripts/e2e-server.mjs` was also SQLite-specific and was ported; `prisma.config.ts` needed no change.
- [x] Rename `src/lib/sqlite-game-repository.ts` → `prisma-game-repository.ts` and update imports. Check that the unique-constraint error mapping (P2002) still reports title/IGDB/Steam conflicts. Also fixed the concurrent-import misreport (D8).
- [x] Adapt `tests/sqlite.test.ts` (now `tests/prisma-repository.test.ts`) and any test that opened a SQLite file to the local Postgres. Each unit test gets its own migrated database (`scripts/test-database.mjs`). Update `.env.example`, `README.md` and `docs/ARCHITECTURE.md` (storage sections).
- **Done when:** `npm run lint`, `npm run typecheck`, `npm test` and `npm run test:e2e` all pass against Docker Postgres. **Done 14 Nov:** lint and typecheck clean, 38/38 unit tests, 27/27 e2e tests.
- Left for S2: `ecosystem.config.cjs` and `deploy/` still describe the SQLite/EBS/PM2 deployment. (Moved to `deploy/individual/` in S2.)

### S2. Runtime glue for AWS (no AWS)

- [x] `scripts/with-database-url.mjs`:
  - Reads the RDS-managed secret (ARN from env) with the AWS SDK.
  - Builds `DATABASE_URL` in memory (URL-encoded password, `sslmode=verify-full`, CA bundle path).
  - Runs the given command. Locally it passes `DATABASE_URL` through unchanged.
  - As built: the RDS-managed secret holds only `username` and `password`, so host, port and database come from `DB_HOST`, `DB_PORT` and `DB_NAME`. The URL carries no TLS parameters; TLS comes from `DATABASE_CA_FILE` (§6 TLS row).
- [x] Make the Prisma `pg` adapter use the CA bundle for TLS (`ssl: { ca, rejectUnauthorized: true }` in code). Give `prisma migrate deploy` its own URL in Prisma's TLS syntax if it rejects `sslmode=verify-full`. Test both against a TLS-enabled Docker Postgres (self-signed CA) before any AWS session. Prisma silently skips verification with `verify-full`, so its own URL is built in `prisma.config.ts` (§6).
- [x] `next.config.ts`: `generateBuildId` returns the commit SHA (from an env var set by `bootstrap.sh`, falling back to `git rev-parse HEAD`). The env var is `GIT_COMMIT`.
- [x] `src/lib/server-secrets.ts`: secret IDs from `IGDB_SECRET_ID` / `STEAM_SECRET_ID`, with the current names as defaults. Update `tests/secrets.test.ts`.
- [x] `GET /api/health`: a shallow 200 response with no DB access.
- [x] Footer badge showing the instance ID and AZ from env vars, hidden when unset (local dev). The env vars are `INSTANCE_ID` and `AVAILABILITY_ZONE`; `/` renders per request.
- [x] `infra/bootstrap.sh`: install packages, build, migrate via the wrapper, and write the env file and systemd units. Set up Nginx with `X-Forwarded-Proto` passthrough and the `X-Served-By` header. Download the RDS CA bundle. Run `cfn-signal`.
  - Contract for the S3 user data: write `/etc/game-library/stack.env` (keys listed at the top of `bootstrap.sh`, including `DB_NAME`, so the template must set `DBName`), clone to `/opt/game-library` at `GitCommit`, then run the script. The script reads the instance ID and AZ from IMDSv2 itself and writes `/etc/game-library/app.env`.
  - It also adds 2 GiB of swap so `next build` can't be killed for memory on a t3.small.
- [x] systemd units: `game-library.service` and the cleanup service and timer, replacing the PM2/EBS-specific `deploy/` files. Keep the old `deploy/` folder as the individual-assignment reference, or move it to `deploy/individual/`. Moved to `deploy/individual/`, with `ecosystem.config.cjs`; new units in `infra/systemd/`, Nginx config in `infra/nginx/`.
- [x] Update `docs/ARCHITECTURE.md` and `README.md` for the new runtime.
- **Done when:** lint, typecheck and all tests pass. `bash -n infra/bootstrap.sh` and `shellcheck` are clean. The wrapper works locally against Docker Postgres. **Done 14 Nov:** lint and typecheck clean, 45/45 unit tests, 27/27 e2e tests; `bash -n` and `shellcheck` clean. The wrapper was tested end to end against a TLS-only Docker Postgres through a stand-in Secrets Manager endpoint. In an `amazonlinux:2023` x86_64 container: package names, `nginx -t` and `systemd-analyze verify` pass, and `npm ci` plus `npm run build` succeed as the app user with the build ID from `GIT_COMMIT`. Not testable without AWS: IMDSv2, `cfn-signal`, the RDS CA bundle and the full boot.

### S3. CloudFormation stack and first deploy (AWS)

- [ ] `infra/game-library.yaml` (YAML): VPC, subnets, IGW, 2 NAT gateways, route tables, S3 gateway endpoint, SGs, S3 bucket and policy, IGDB/Steam secrets (NoEcho params), RDS parameter group, subnet group and Multi-AZ instance, ALB, listeners and target group, launch template (user data checks out the `GitCommit` parameter), ASG with CreationPolicy, `AutoScalingRollingUpdate` update policy and target tracking policy, SNS topic and subscription, alarm, dashboard. Outputs: HTTPS URL, bucket name, DB endpoint.
- [ ] `infra/deploy.sh`, `infra/deploy.env.example`, and `infra/deploy.env` added to `.gitignore`.
- [ ] Validate locally: `cfn-lint infra/game-library.yaml`, then `aws cloudformation validate-template`.
- [ ] Record the Lab credit balance, then deploy with `--disable-rollback`. Confirm the SNS subscription email.
- [ ] Work through every row of §6 and record the results in this document.
- [ ] Measure boot-to-healthy time and single-instance capacity (D6). Set the scaling target (≈ half capacity), grace period and warmup as parameter defaults, and record the numbers here.
- [ ] Smoke test: add a game, upload a cover, IGDB autofill, Steam import, export, and `X-Served-By` alternating.
- [ ] Record credits, then **Reset the Lab**.

### S4. Evidence run (AWS)

- [ ] Record credits, run a clean `deploy.sh`, confirm the SNS email, and capture the stack events timeline.
- [ ] Run everything in §7 in order. Save logs, screenshots and dashboard graphs with timestamps into a local evidence folder (not committed if it contains account IDs).
- [ ] Record the video while the stack runs (≤ 2:30).
- [ ] Record credits, then **Reset the Lab**.

### S5. Documents (no AWS)

- [ ] Draft the design document (< 8 pages, < 4,000 words, one referencing style) with the required sections: objective and route; architecture and services; scalability; high availability; networking, security and data; cost; Going Further (auto scaling) with evidence; contribution statement. Put the key results in the body, with figures in the appendix, plus the AI-use statement and dated progress screenshots.
- [ ] Build the 12-month Pricing Calculator estimate from §5. Export it as a PDF (≤ 2 pages) with assumptions, and summarise the takeaways in the doc.
- [ ] Hand the §8 change list to whoever edits the diagram, and check the result against the rubric (components, AZs, request distribution, data tier, labelled arrows).
- [ ] Submission rules from the Q&A:
  - The group cover sheet is signed by every member (electronic signatures accepted).
  - The submitting member includes their own contribution statement in the group submission.
  - Every other member submits their own signed statement individually on Moodle.
  - Everything else (documents, code, video) goes in one submission.
- [ ] Final check of all deliverables against the brief and marking checklist; follow the Moodle naming convention.

Suggested timing: S1 and S2 on 14 Nov, S3 on 15 Nov, S4 on 15–16 Nov, S5 on 16 Nov, leaving the morning of 17 Nov as a buffer before the 4:00 pm deadline.
