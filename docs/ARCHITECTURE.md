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

`GameRepository` exposes list/get/create/update/delete. The active implementation stores validated game JSON plus unique normalized-title, optional IGDB identity and optional cover keys. JSON preserves safe-integer playtime. `CoverObject` tracks pending, attached and garbage objects. The in-memory repository remains a test double; fixtures are not automatically seeded.

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

POST/PATCH accept JSON, or multipart `input` JSON plus one `cover` file. Unknown fields and empty PATCH bodies are rejected. JSON may supply placeholder/external-URL covers, but not upload references. Omitting `cover` on PATCH preserves it. JSON requests are limited to 512 KiB; multipart requests to 5 MiB plus 512 KiB, before parsing. Sharp validates and decodes image bytes before storage.

Errors return an `error` string with 400 for invalid input, 404 for missing records/references, 409 for duplicate titles, 413 for oversized requests or 500 for unexpected/storage failures. GET responses use `no-store`; images also use `nosniff` and a restrictive CSP.

React holds a fetched copy plus UI state. Create/edit use server responses, delete removes records after success, and quick status changes across all views roll back on failure. A browser action lock prevents overlapping mutations. There is no polling or cross-tab synchronization. External cover URLs are fetched directly by the browser.

## Phase 9 IGDB autofill (implemented)

`server-igdb.ts` is a Node-only provider client shared through `globalThis` across API route bundles. Configure `IGDB_CLIENT_ID` and `IGDB_CLIENT_SECRET` on the server. Twitch client-credentials tokens are cached until one minute before expiry, with one renewal/retry after a 401. Requests run sequentially at least 260 ms apart, with at most 20 pending calls, an 8-second timeout per outbound request and a 1 MiB response limit. IGDB 429/5xx responses retry once, with a bounded delay. Errors return safe messages without credentials or upstream response bodies.

| Method and path              | Responsibility                                                 |
| ---------------------------- | -------------------------------------------------------------- |
| `GET /api/igdb/search?q=...` | Up to 20 validated results for a trimmed 1–160 character title |
| `GET /api/igdb/games/:id`    | Metadata for a positive safe-integer IGDB ID; 404 when absent  |

Responses use `no-store`. Missing credentials return 503, invalid input 400, queue/rate-limit failures 429 and other provider failures 502. Queries escape the search string. Provider data is normalized into title, optional release year/date, URL cover and genres as tags. A full release date requires the first-release timestamp to match a release record with a complete `date_format.format`; partial dates are omitted. Invalid optional genres/covers are omitted and titles must fit existing domain validation.

Search requests use a lightweight field projection (name, first-release year, cover and available platform names). Detail requests expand releases, genres, company names/roles, summary/storyline and screenshot image IDs. Validated optional fields are omitted when invalid; provider platform IDs and screenshot IDs are retained. Request AbortSignals reach the provider queue: cancelled queued calls free pending capacity and are checked before outbound work; active provider fetches also abort. The existing 260 ms pacing, token lifecycle and error handling remain.

`GameForm` owns a controlled draft including metadata, personal values, identity and platform options. The create workflow remains mounted while the form is shown so search/preview state survives Back; inputs remain mounted while the workflow is shown. `IgdbAutofill` handles search, preview and direct-ID loading. `MetadataComparison` owns mode/manual choices and uses shared pure functions in `igdb.ts` for proposals, eligibility and application. `GameMetadata` and `ScreenshotGallery` serve previews/details and screenshot editing. No IGDB localStorage preferences or timed Undo are used.

Game JSON gains availablePlatforms, developers, publishers, summary, storyline and screenshots. `Game.igdbId` is a nullable unique column synchronized with the public JSON identity in the same save transaction. The additive migration leaves existing rows unlinked. Repository test doubles enforce the same identity constraint; API conflicts distinguish title from IGDB identity. Zod bounds arrays, text and screenshot identifiers. JSON/multipart metadata allowance is 512 KiB to accommodate Unicode prose; cover upload limits are unchanged.

Screenshots store only validated image IDs and derive thumbnail/full-size HTTPS URLs. They are browser-loaded lazily and are not part of upload cleanup. Approved cover replacement retains the existing transactional retirement path; a draft upload is discarded only when its cover replacement is applied. Provider lookup never writes to the database. Comparison apply prepares a draft; Cancel or a parent dismissal checks the draft against its initial snapshot, including pending comparison values. Changes require explicit Save and close or Discard; Keep editing preserves the draft. Confirmed saves use the same validation/mutation path as Save. Imperative form/workflow handles expose the pending draft without duplicating merge rules. `Library` renders confirmation inside the existing dialog with the alertdialog role, keeping the form mounted but hidden. Keep editing receives initial focus; Escape resumes editing and outside clicks leave confirmation open. Failed writes leave the dialog open. Screenshot dialogs maintain independent dismissal state.

## Phase 9 Steam architecture (planned, not implemented)

Add a server-only Steam client with one shared `STEAM_WEB_API_KEY`. Use the public HTTPS host `api.steampowered.com` and `GetOwnedGames`, including app information and played free games. Resolve vanity URLs through Steam's API; accept only valid ID64 or Steam Community profile routes. Distinguish confirmed empty libraries from inaccessible details where possible; otherwise report that access could not be confirmed.

Add read-only `POST /api/steam/preview` and bounded `POST /api/steam/import` endpoints. Batch and paginate IGDB enrichment through the shared client, matching Steam App IDs via `external_games.external_game_source`. Allow manual IGDB matching and Steam-only import for unresolved games.

Reuse the implemented IGDB identity and add optional `steamAppId` to game JSON/validation and a nullable unique column in an additive migration. Preserve existing records/title uniqueness and resolve identity conflicts explicitly. On commit recheck identities/current values, apply only confirmed fields and save each game independently through the repository. Return per-row results and retain failed rows for retry. Provider fetches occur outside database transactions. Steam gets its own field-preference map and temporary row overrides; follow SPEC's playtime safeguard.

Provider references: [IGDB API](https://api-docs.igdb.com/), [Steam owned games](https://partner.steamgames.com/doc/webapi/IPlayerService?l=english), [Steam API host and authentication](https://partner.steamgames.com/doc/webapi_overview?l=english).

## Deployment status

Phase 7 deployment is owner-confirmed on Amazon Linux 2023 at `/home/ec2-user/infs3701-game-library`. The documented environment uses Nginx on port 80 and PM2 with one Next.js process on `127.0.0.1:3000`.

Phase 8 cloud deployment and validation are complete, owner-confirmed on 2026-10-02. The [deployment runbook](../deploy/README.md) and supplied PM2, EBS mount, IAM and cleanup configurations remain operational references. EBS snapshots exclude S3 object contents.

`npm ci` generates Prisma Client. `npm run dev` applies migrations first; `npm run build` generates the client and builds with webpack. `npm start` checks storage but does not apply migrations. Local production-build testing requires `STORAGE_MODE=local`, as provided in `.env.example`.
