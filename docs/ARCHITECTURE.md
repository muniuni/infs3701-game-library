# Architecture

## Stack and code boundaries

Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, Radix-based local UI components, Zod, Prisma with the better-sqlite3 adapter, Sharp and AWS SDK v3. Fonts are bundled through Fontsource. Node.js 20.19+, 22.12+ or 24+ is supported; EC2 uses Node.js 24.

| Location                                             | Responsibility                                                               |
| ---------------------------------------------------- | ---------------------------------------------------------------------------- |
| `src/app/page.tsx`, `src/components/`                | Library views, dialogs and forms                                             |
| `src/lib/game.ts`, `library-query.ts`                | Domain validation and browser-side queries                                   |
| `src/app/api/`                                       | Dynamic Node.js CRUD and cover delivery routes                               |
| `src/lib/server-repository.ts`, `database.ts`        | Lazy process-wide repository and guarded database connection                 |
| `src/lib/sqlite-game-repository.ts`                  | Prisma CRUD, title uniqueness and cover cleanup ledger                       |
| `src/lib/server-cover-storage.ts`                    | Local/EBS backend selection                                                  |
| `src/lib/local-cover-storage.ts`, `cover-storage.ts` | Filesystem/S3 objects and image validation                                   |
| `src/lib/mutation-body.ts`                           | Bounded JSON/multipart parsing                                               |
| `prisma/`, `scripts/`, `deploy/`                     | Schema/migration, startup/migration guards, cleanup and deployment templates |

`GameRepository` exposes list/get/create/update/delete. The active implementation stores validated game JSON plus unique normalized-title and optional cover keys. JSON preserves safe-integer playtime. `CoverObject` tracks pending, attached and garbage objects. The in-memory repository remains a test double; fixtures are not automatically seeded.

## Storage selection and lifecycle

`STORAGE_MODE` overrides the default: local outside production, EBS in production. Local defaults are `data/game-library.sqlite` and `data/covers/`; `DATABASE_URL` requires an absolute `file:` path, and `LOCAL_COVERS_DIR` overrides the image directory. Cover files use UUID names and `.jpg`, `.png` or `.webp` extensions. Local mode does not instantiate S3 or require AWS credentials.

EBS mode requires `/mnt/game-library-data/game-library.sqlite`, Linux, `EBS_VOLUME_UUID`, an exact filesystem mount and a device distinct from the root filesystem. These checks run before opening SQLite or applying migrations. Database journals remain beside the database. S3 defaults to `infs3701-game-library-images` in `us-east-1`; `S3_BUCKET` and `AWS_REGION` can override them. The SDK uses its credential chain; EC2 configuration calls for an instance role.

An upload ledger entry is created before writing the object. A database transaction attaches the new cover and retires the previous one. Failed saves attempt object cleanup; ambiguous write failures retain a pending entry for later cleanup. Committed edits are not rolled back when deletion fails.

Mutations attempt deletion of their own retired objects. `npm run covers:cleanup` processes up to 100 garbage objects and retires pending uploads older than 24 hours. Local cleanup is manual. The production timer runs two minutes after boot and five minutes after the previous run ends.

## API

| Method and path         | Success                         |
| ----------------------- | ------------------------------- |
| `GET /api/games`        | 200, all games                  |
| `POST /api/games`       | 201, created game               |
| `GET /api/games/:id`    | 200, one game                   |
| `PATCH /api/games/:id`  | 200, updated game               |
| `DELETE /api/games/:id` | 204                             |
| `GET /api/covers/:id`   | 200, currently referenced image |

POST/PATCH accept JSON, or multipart `input` JSON plus one `cover` file. Unknown fields and empty PATCH bodies are rejected. JSON may supply placeholder/external-URL covers, but not upload references. Omitting `cover` on PATCH preserves it. JSON requests are limited to 64 KiB; multipart requests to 5 MiB plus 64 KiB, before parsing. Sharp validates and decodes image bytes before storage.

Errors return an `error` string with 400 for invalid input, 404 for missing records/references, 409 for duplicate titles, 413 for oversized requests or 500 for unexpected/storage failures. GET responses use `no-store`; images also use `nosniff` and a restrictive CSP.

React holds a fetched copy plus UI state. Create/edit use server responses, delete removes records after success, and quick status changes across all views roll back on failure. A browser action lock prevents overlapping mutations. There is no polling or cross-tab synchronization. External cover URLs are fetched directly by the browser.

## Deployment status

Phase 7 deployment is owner-confirmed on Amazon Linux 2023 at `/home/ec2-user/infs3701-game-library`. The documented environment uses Nginx on port 80 and PM2 with one Next.js process on `127.0.0.1:3000`.

Phase 8 cloud deployment and validation are complete, owner-confirmed on 2026-10-02. The [deployment runbook](../deploy/README.md) and supplied PM2, EBS mount, IAM and cleanup configurations remain operational references. EBS snapshots exclude S3 object contents.

`npm ci` generates Prisma Client. `npm run dev` applies migrations first; `npm run build` generates the client and builds with webpack. `npm start` checks storage but does not apply migrations. Local production-build testing requires `STORAGE_MODE=local`, as provided in `.env.example`.
