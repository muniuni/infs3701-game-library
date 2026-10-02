# Game Library

Single-user Next.js game library with Prisma/SQLite persistence and cover uploads stored locally or in private S3. Grid, List and Kanban share title search, status/platform/tag/minimum-rating filters and sorting. Add/edit/detail/delete use dialogs; Kanban supports dragging and keyboard-accessible status controls. No authentication or RAWG integration.

## Local setup

Use Node.js 24 (also supported: 20.19+ or 22.12+).

```sh
npm ci
cp .env.example .env
npm run dev
```

Development applies migrations automatically. SQLite defaults to `data/game-library.sqlite`; new databases start empty and survive process restarts. In local mode, uploaded images are saved under `data/covers/` and served through the image API. No AWS setup is needed. EBS mode uses S3 through the AWS credential chain.

```sh
npm run db:deploy
npm run build
npm start
```

The example `.env` sets `STORAGE_MODE=local` for local production-build testing. EC2 must use EBS mode; see [deployment and owner validation](deploy/README.md). Phase 8 code is implemented, but cloud deployment and validation are pending.

## API

`GET/POST /api/games`, `GET/PATCH/DELETE /api/games/:id`, and `GET /api/covers/:id`.

POST/PATCH accept JSON or multipart `input` JSON plus one `cover` file. Supported images are JPEG, PNG and WebP, up to 5 MiB and 40 megapixels, still images only. The server owns uploaded references. Omitting `cover` on PATCH preserves it; placeholder/URL replacements retire the previous object. Optional fields clear with `null`; duplicate normalized titles return 409. Invalid input returns 400 and oversized requests return 413.

Game mutations and a durable cover ledger are stored together in SQLite. Failed S3 deletions retry with `npm run covers:cleanup`; production must install the supplied timer. EBS snapshots back up SQLite, not S3 object contents.

## Verification

```sh
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

E2E uses disposable SQLite and local cover files in a temporary directory on port 3101 (`PLAYWRIGHT_PORT` override). It never accesses real AWS. See the four documents in [docs](docs/) for scope, architecture, design and implementation status.
