# Architecture

## Implemented stack and deployment

Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, locally styled shadcn/ui Button/Dialog components using Radix, and Zod validation. Fonts are bundled through Fontsource.

**Phase 7 EC2 deployment is complete**, as confirmed by the project owner. The deployment environment is Amazon Linux 2023; the repository path on EC2 is `/home/ec2-user/infs3701-game-library`. The production build was reported successful.

The diagram describes the Phase 8 code/configuration awaiting deployment, not a live EC2 audit.

```text
Browser
  ↓ HTTP
Nginx :80
  ↓
Next.js :3000
  ↓
SqliteGameRepository → Prisma → SQLite on EBS
  ↓ uploaded covers
Private S3 (through IAM)

PM2 manages the Next.js process.
```

The deployment uses Nginx on port 80 as a reverse proxy and PM2 to run
and monitor one Next.js process on `127.0.0.1:3000` with Node.js 24.

The supplied `ecosystem.config.cjs` configures Phase 8 for PM2. The owner must apply its mount dependency and verify restoration after reboot.

The repository's `npm start` command itself runs `next start --hostname 0.0.0.0` (default port 3000). `npm run build` uses webpack. Supported Node.js versions are 20.19+, 22.12+ or 24+; deployment uses Node.js 24. `npm start` checks the configured filesystem before starting Next.js.

## Implemented code boundaries

| Location                                       | Responsibility                                                                |
| ---------------------------------------------- | ----------------------------------------------------------------------------- |
| `src/app/page.tsx`, `src/components/`          | Client library, views, forms and dialogs                                      |
| `src/lib/game.ts`                              | Domain types, shared create/update schemas and playtime formatting            |
| `src/lib/library-query.ts`                     | Browser-side search, filters and sorting                                      |
| `src/app/api/games/`                           | Node.js CRUD route handlers                                                   |
| `src/lib/repository.ts`                        | Async `GameRepository` interface and Map-backed `InMemoryGameRepository`      |
| `src/lib/server-repository.ts`                 | Lazy, process-wide SQLite repository and S3 client                            |
| `src/lib/sqlite-game-repository.ts`            | Prisma CRUD, normalized uniqueness and durable cover cleanup                  |
| `src/lib/cover-storage.ts`, `mutation-body.ts` | Bounded upload parsing, image decoding and S3 operations                      |
| `prisma/`, `scripts/`, `deploy/`               | Schema/migrations, filesystem guard, cleanup job and deployment configuration |
| `src/lib/seed.ts`                              | Six fictional development fixtures                                            |

Repository operations are `listGames`, `getGame`, `createGame`, `updateGame` and `deleteGame`. Returned records are cloned to prevent callers mutating storage. The server creates IDs/timestamps, validates input and enforces normalized-title uniqueness.

The active repository stores each game as validated JSON, with a database unique normalized-title key and unique optional S3 cover key. This preserves optional values and JavaScript safe-integer playtime without SQLite/Prisma 32-bit narrowing. `CoverObject` records pending, attached and garbage objects. Transactions attach new references and retire old references together. The in-memory implementation remains a test double. There is no persistent browser storage.

## Implemented API

| Method and path         | Success response  |
| ----------------------- | ----------------- |
| `GET /api/games`        | 200, all games    |
| `POST /api/games`       | 201, created game |
| `GET /api/games/:id`    | 200, one game     |
| `PATCH /api/games/:id`  | 200, updated game |
| `DELETE /api/games/:id` | 204, no body      |

Routes are dynamic; GET responses use `Cache-Control: no-store`. Errors return an `error` string with 400 for invalid JSON/input, 404 for missing records, 409 for duplicate titles, 413 for oversized uploads, or 500 for unexpected failures. Unknown input fields and empty PATCH bodies are rejected. PATCH accepts partial fields and `null` to clear optional values. POST/PATCH also accept multipart `input` JSON plus a single `cover` file. JSON cannot supply upload keys or URLs; omitting `cover` on PATCH preserves the existing cover. `GET /api/covers/:id` serves only currently referenced objects with `no-store` and `nosniff` headers.

## Implemented client behavior

The server is authoritative, while React holds a fetched copy of games plus view/filter/dialog/form/drag state and loading/error state. Create/edit replace local records with server responses; delete removes a record after success. Kanban temporarily applies the new status and restores the previous record on failure. A client action lock prevents overlapping mutations in that browser.

There is no polling or cross-tab synchronization. Search and sorting do not issue server queries. External cover URLs are fetched directly by the browser, with a local fallback. Uploads use the application image API. No external game metadata API is used.

## Phase 8 operational boundaries

`STORAGE_MODE=local` uses an absolute local database path, defaulting to `data/game-library.sqlite`. Production defaults to `ebs`. EBS mode checks the exact mount, filesystem UUID and separate device before opening SQLite or running migrations. The PM2 configuration explicitly selects EBS mode; its supplied systemd drop-in also requires the mount. The database and journals reside on the same filesystem.

S3 uses `GetObject`, `PutObject` and `DeleteObject` on `covers/*`, with no public ACL. The EC2 instance profile supplies temporary credentials. The local-only `S3_ENDPOINT` setting enables isolated protocol-stub tests. Upload requests are stream-bounded before multipart parsing and decoded with Sharp before S3 access.

An object is recorded before PUT. A successful database transaction attaches it and queues any old object; failed writes leave recoverable ledger entries. Ambiguous PUT failures retain a pending entry for a second cleanup after 24 hours. Mutations attempt cleanup of their own retired objects; the supplied five-minute systemd timer retries the persistent backlog, up to 100 per run. S3 failures do not roll back an already committed game edit. Deployment must install the timer.

The owner performs EC2/AWS validation. Mount and IAM configuration, private S3 reads, reboot behavior and EBS snapshot restoration are not verified locally. [Deployment instructions and configuration](../deploy/README.md) cover these steps. EBS backups contain object references but not historical S3 image contents.

Phase 9 RAWG and Phase 10 assignment extensions remain unimplemented.

References: [Prisma SQLite](https://docs.prisma.io/docs/prisma-orm/quickstart/sqlite), [AWS SDK S3](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/javascript_s3_code_examples.html), [EC2 IAM roles](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/iam-roles-for-amazon-ec2.html), [S3 Block Public Access](https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-control-block-public-access.html).
