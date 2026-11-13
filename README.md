# Game Library

Single-user Next.js game library with Prisma/PostgreSQL persistence and cover uploads stored locally or in private S3. Grid, List and Kanban share title search, status/platform/tag/minimum-rating filters and sorting. Add/edit/detail/delete use dialogs; all views offer quick status changes, and Kanban supports dragging. No authentication or RAWG integration.

## Documentation map

| File | What it covers | Current? |
| --- | --- | --- |
| [docs/GROUP_ARCHITECTURE.md](docs/GROUP_ARCHITECTURE.md) | The group design: scope and requirements (§1–2), architecture overview (§3), every decision with its rationale and trade-off (§4, D1–D16), cost and credits (§5), what was verified in AWS (§6), the evidence plan (§7), diagram changes (§8), implementation sessions and measurements (§9), and handover notes for the group (§10). | Yes. It is the source of truth; if it disagrees with another doc, it wins. |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | How the code is organised: stack, storage and database connection, API, credentials, IGDB/Steam/export internals, and the group runtime on EC2. | Yes |
| [docs/DESIGN.md](docs/DESIGN.md) | The user interface: visual system, views, dialogs, responsive layout and accessibility. | Yes |
| [infra/](infra/) | The group deployment as code: `game-library.yaml` (the single CloudFormation stack), `deploy.sh` (deploys it), `bootstrap.sh` (runs on each instance at boot), Nginx and systemd files, and `load/capacity.js` (the k6 capacity test). | Yes |
| [docs/individual/](docs/individual/) | Archived individual-assignment documents: the product spec (`SPEC.md`) and the implementation plan (`IMPLEMENTATION_PLAN.md`). | No. Each file starts with a note on what is out of date. |
| [deploy/individual/](deploy/individual/README.md) | Archived individual-assignment runbook for a single EC2 instance with SQLite on EBS and PM2. | No |

The assignment brief, the marking scheme and the group-approved architecture diagram are kept outside this repository.

### What to give the AI for each deliverable

Give the AI only the files and sections listed for your deliverable. The "§" and "D" numbers refer to [docs/GROUP_ARCHITECTURE.md](docs/GROUP_ARCHITECTURE.md). Don't give it `docs/individual/` or `deploy/individual/`. They describe the old single-instance SQLite/EBS design and will mislead it. The one exception is the feature sections of `docs/individual/SPEC.md`, if you need detail on what the app does.

The §10 items marked "After S4" (failover, alarm and scale-out results, and the credits used) don't exist until the evidence run is done.

**Design document**

- `docs/GROUP_ARCHITECTURE.md`:
  - §1 Scope, §2 Requirements and §3 Architecture overview.
  - §4, all decisions (D1–D16).
  - §5 Cost and credits, for the cost section.
  - §6 Unknowns (the results recorded in AWS) and §7 Evidence plan.
  - §9 S3, for the measurements and the first deploy's failure and fix.
  - §10 "Design document", for what is ready now and what waits for S4.
- `docs/ARCHITECTURE.md`, sections "Group runtime on EC2", "Storage selection and lifecycle" and "Server credentials", for implementation detail.
- Optional: `docs/individual/SPEC.md`, feature sections only (data model, library behaviour, IGDB, Steam, export), for describing the app.

**Architecture diagram**

- `docs/GROUP_ARCHITECTURE.md`:
  - §3 Architecture overview.
  - §8 Diagram changes, the list of edits to make to the approved diagram.
  - §10 "Diagram".
  - D2 Network (subnets and routes), D3 Security groups, D5 Load balancer and HTTPS, D6 Auto Scaling (sizes and targets), D7 Database, D9 S3, D10 Secrets and certificate, D12 Monitoring.
- Optional: `infra/game-library.yaml`, to check a component against what is actually deployed.

**Cost estimate**

- `docs/GROUP_ARCHITECTURE.md`:
  - §5 Cost and credits: the hourly table, the credits used and the line items for the 12-month estimate.
  - §10 "Cost estimate".
  - D2 (two NAT gateways), D5 (ALB), D6 (instance counts, scale-out and why no CPU-credit charges are expected), D7 (RDS Multi-AZ and storage), D9 (S3), D10 (Secrets Manager), D12 (CloudWatch and SNS) and D15 (sessions and credits).
- Optional: the `Parameters` section of `infra/game-library.yaml`, for the instance and database sizes.

## Local setup

Use Node.js 24 (also supported: 20.19+ or 22.12+) and Docker for the local PostgreSQL.

```sh
npm ci
cp .env.example .env
docker compose up -d --wait
npm run dev
```

Development applies migrations automatically. The database defaults to the PostgreSQL container in `compose.yaml` (data kept in a Docker volume; `docker compose down -v` resets it). In local mode, uploaded images are saved under `data/covers/` and served through the image API. No AWS setup is needed. S3 mode stores covers in S3 through the AWS credential chain.

```sh
npm run db:deploy
npm run build
npm start
```

The example `.env` sets `STORAGE_MODE=local` and `SECRETS_SOURCE=env` for local production-build testing. IGDB and Steam credentials can be supplied through `.env`/`.env.local`; EC2 uses `SECRETS_SOURCE=aws` to retrieve both provider secrets from Secrets Manager in `us-east-1` through its instance role.

## AWS deployment

The group deployment (2–4 instances behind an HTTPS ALB, RDS PostgreSQL Multi-AZ, S3 covers) is designed in [docs/GROUP_ARCHITECTURE.md](docs/GROUP_ARCHITECTURE.md). Each instance runs [infra/bootstrap.sh](infra/bootstrap.sh) at boot: it builds the app, applies migrations and starts Nginx plus the systemd units in [infra/](infra/). Processes that use the database run through `scripts/with-database-url.mjs`, which builds `DATABASE_URL` in memory from the RDS-managed secret. TLS to RDS is verified against the CA in `DATABASE_CA_FILE`. `GET /api/health` is the shallow load-balancer health check. Responses carry `X-Served-By`, and a footer badge shows the instance and AZ. Instances clone the repo from GitHub, so push app and `infra/` changes before deploying. The runtime is summarised in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#group-runtime-on-ec2). The individual-assignment SQLite/EBS runbook is kept in [deploy/individual/](deploy/individual/README.md) for reference and no longer matches the code.

## Deploy to your own Learner Lab

This builds the full group stack described in [docs/GROUP_ARCHITECTURE.md](docs/GROUP_ARCHITECTURE.md) in your own AWS Academy Learner Lab account. It deploys whatever is on `main` on GitHub, so you don't need to change or push any code.

**You need:**

- macOS or Linux (on Windows, use WSL).
- AWS CLI v2, `git`, `openssl` and `bash`. Node.js and Docker are not needed for deploying.
- A clone of this repository. Run `git pull` before every deploy so the template is up to date.

**1. Set up the credentials.** Start the Lab and wait for the indicator to turn green. Open **AWS Details**, click **Show** next to AWS CLI, and paste the whole block into `~/.aws/credentials`, replacing what is there under `[default]`. These credentials expire when the Lab session ends, so paste fresh ones each session. The script defaults to `us-east-1`, so no region setup is needed. Check that they work:

```sh
aws sts get-caller-identity
```

**2. Create `infra/deploy.env`.**

```sh
cp infra/deploy.env.example infra/deploy.env
```

Fill in `IGDB_CLIENT_ID`, `IGDB_CLIENT_SECRET` and `STEAM_WEB_API_KEY` with the API keys the repository owner has already shared with group members. Set `ALERT_EMAIL` to your own email address; the health alarm sends its notifications there. `infra/deploy.env` is gitignored. Never commit it, and don't paste the keys anywhere else.

**3. Run the deploy.**

```sh
infra/deploy.sh
```

Creating the stack takes about **25–35 minutes**, mostly the Multi-AZ database and the app build on each instance. The script waits until the app is serving, then prints the stack outputs, including the HTTPS URL. If creation fails, CloudFormation rolls back and deletes what it created. Run `infra/deploy.sh --disable-rollback` instead to keep the failed resources for inspection.

**4. Confirm the email.** You receive an "AWS Notification - Subscription Confirmation" email at `ALERT_EMAIL` (check spam). Click **Confirm subscription**, or the alarm emails won't arrive. You have to do this after every new deploy.

**5. Open the app.** Open the HTTPS URL. The browser warns about the certificate because it is self-signed (D10). Accept the warning to continue.

**Cost:** about **US$0.22–0.27 per hour** while the stack runs, mostly the two NAT gateways (see [§5](docs/GROUP_ARCHITECTURE.md#5-cost-and-credits)). Note your Lab budget before and after the session.

**6. When you are done, Reset the Lab.** Click **Reset** in the Learner Lab to delete everything the stack created. Ending the Lab session alone does not delete the stack, and resources such as the NAT gateways and the load balancer keep using your credits.

## API

`GET/POST /api/games`, `GET/PATCH/DELETE /api/games/:id`, `GET /api/covers/:id`, and `GET /api/health` (always 200, no database access).

POST/PATCH accept JSON or multipart `input` JSON plus one `cover` file. Supported images are JPEG, PNG and WebP, up to 5 MiB and 40 megapixels, still images only. The server owns uploaded references. Omitting `cover` on PATCH preserves it; placeholder/URL replacements retire the previous object. Optional fields clear with `null`; duplicate normalized titles return 409. Invalid input returns 400 and oversized requests return 413.

Game mutations and a durable cover ledger are stored together in PostgreSQL. Failed S3 deletions retry with `npm run covers:cleanup`; production uses the supplied cleanup timer.

## Verification

```sh
docker compose up -d --wait
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Unit tests create one disposable PostgreSQL database per test on the Docker server. E2E uses a disposable `game_library_e2e` database (recreated each run) and local cover files in a temporary directory on port 3101 (`PLAYWRIGHT_PORT` override). It never accesses real AWS. See the [documentation map](#documentation-map) for the design and code documents.
