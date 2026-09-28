# Architecture

## Implemented stack and deployment

Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, locally styled shadcn/ui Button/Dialog components using Radix, and Zod validation. Fonts are bundled through Fontsource.

**Phase 7 EC2 deployment is complete**, as confirmed by the project owner. The deployment environment is Amazon Linux 2023; the repository path on EC2 is `/home/ec2-user/infs3701-game-library`. The production build was reported successful.

```text
Browser → HTTP → EC2 → Next.js → InMemoryGameRepository
```

The deployment instructions use Nginx on port 80 and systemd to run one Next.js process on `127.0.0.1:3000` with Node.js 24. These host configurations and public-address evidence are not checked into this repository; completion is owner-reported, not a live infrastructure audit.

The repository's `npm start` command itself runs `next start --hostname 0.0.0.0` (default port 3000). `npm run build` uses webpack. The declared Node.js minimum is 20.9.0.

## Implemented code boundaries

| Location                              | Responsibility                                                           |
| ------------------------------------- | ------------------------------------------------------------------------ |
| `src/app/page.tsx`, `src/components/` | Client library, views, forms and dialogs                                 |
| `src/lib/game.ts`                     | Domain types, shared create/update schemas and playtime formatting       |
| `src/lib/library-query.ts`            | Browser-side search, filters and sorting                                 |
| `src/app/api/games/`                  | Node.js CRUD route handlers                                              |
| `src/lib/repository.ts`               | Async `GameRepository` interface and Map-backed `InMemoryGameRepository` |
| `src/lib/server-repository.ts`        | Process-wide repository instance stored on `globalThis`                  |
| `src/lib/seed.ts`                     | Six fictional development fixtures                                       |

Repository operations are `listGames`, `getGame`, `createGame`, `updateGame` and `deleteGame`. Returned records are cloned to prevent callers mutating storage. The server creates IDs/timestamps, validates input and enforces normalized-title uniqueness.

The shared instance survives development module reloads but not process restarts. Production starts empty. Run one process; separate instances do not share records. No database, filesystem game persistence or browser storage exists.

## Implemented API

| Method and path         | Success response  |
| ----------------------- | ----------------- |
| `GET /api/games`        | 200, all games    |
| `POST /api/games`       | 201, created game |
| `GET /api/games/:id`    | 200, one game     |
| `PATCH /api/games/:id`  | 200, updated game |
| `DELETE /api/games/:id` | 204, no body      |

Routes are dynamic; GET responses use `Cache-Control: no-store`. Errors return an `error` string with 400 for invalid JSON/input, 404 for missing records, 409 for duplicate titles, or 500 for unexpected failures. Unknown input fields and empty PATCH bodies are rejected. PATCH accepts partial fields and `null` to clear optional values.

## Implemented client behavior

The server is authoritative, while React holds a fetched copy of games plus view/filter/dialog/form/drag state and loading/error state. Create/edit replace local records with server responses; delete removes a record after success. Kanban temporarily applies the new status and restores the previous record on failure. A client action lock prevents overlapping mutations in that browser.

There is no polling or cross-tab synchronization. Search and sorting do not issue server queries. External cover URLs are fetched directly by the browser, with a local fallback; no image proxy or external game API is used.

## Planned architecture

- Implement `SqliteGameRepository` behind the existing interface, storing the database on EBS-backed EC2 storage and verifying persistence across restarts.
- Add S3 upload handling and store uploaded-cover references in SQLite. Manual URLs remain remote.
- Optionally add isolated server-side RAWG search/autofill; API keys stay on the server and failures must not block manual CRUD.
- Select three justified Weeks 1–4 assignment extensions after reviewing course material. None is selected or implemented yet.

No SQLite, S3 or RAWG dependencies, endpoints or integrations are currently implemented. EBS-backed game-data persistence is also not implemented; ordinary EC2 disk use does not provide persistence for the in-memory repository.
