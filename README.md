# Game Library

Single-user Next.js game library with Prisma/PostgreSQL persistence and cover uploads stored locally or in private S3. Grid, List and Kanban share title search, status/platform/tag/minimum-rating filters and sorting. Add/edit/detail/delete use dialogs; all views offer quick status changes, and Kanban supports dragging. No authentication or RAWG integration.

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

The example `.env` sets `STORAGE_MODE=local` and `SECRETS_SOURCE=env` for local production-build testing. IGDB and Steam credentials can be supplied through `.env`/`.env.local`; EC2 uses `SECRETS_SOURCE=aws` to retrieve both provider secrets from Secrets Manager in `us-east-1` through its instance role. The group deployment (RDS PostgreSQL Multi-AZ, S3 covers) is described in [docs/GROUP_ARCHITECTURE.md](docs/GROUP_ARCHITECTURE.md). The single-instance SQLite/EBS runbook in [deploy/README.md](deploy/README.md) is kept as the individual-assignment reference and no longer matches the code.

## API

`GET/POST /api/games`, `GET/PATCH/DELETE /api/games/:id`, and `GET /api/covers/:id`.

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

Unit tests create one disposable PostgreSQL database per test on the Docker server. E2E uses a disposable `game_library_e2e` database (recreated each run) and local cover files in a temporary directory on port 3101 (`PLAYWRIGHT_PORT` override). It never accesses real AWS. See the four documents in [docs](docs/) for scope, architecture, design and implementation status.
