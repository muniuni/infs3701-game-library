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

## Phase 9 IGDB autofill (implemented)

`server-igdb.ts` is a Node-only provider client shared through `globalThis` across API route bundles. Configure `IGDB_CLIENT_ID` and `IGDB_CLIENT_SECRET` on the server. Twitch client-credentials tokens are cached until one minute before expiry, with one renewal/retry after a 401. Requests run sequentially at least 260 ms apart, with at most 20 pending calls, an 8-second timeout per outbound request and a 1 MiB response limit. IGDB 429/5xx responses retry once, with a bounded delay. Errors return safe messages without credentials or upstream response bodies.

| Method and path              | Responsibility                                                 |
| ---------------------------- | -------------------------------------------------------------- |
| `GET /api/igdb/search?q=...` | Up to 20 validated results for a trimmed 1–160 character title |
| `GET /api/igdb/games/:id`    | Metadata for a positive safe-integer IGDB ID; 404 when absent  |

Responses use `no-store`. Missing credentials return 503, invalid input 400, queue/rate-limit failures 429 and other provider failures 502. Queries escape the search string. Provider data is normalized into title, optional release year/date, URL cover and genres as tags. A full release date requires the first-release timestamp to match a release record with a complete `date_format.format`; partial dates are omitted. Invalid optional genres/covers are omitted and titles must fit existing domain validation.

The form controls title, release date and Tags while other fields remain mounted. `IgdbTitleInput` is used only for Create: its Radix-anchored combobox debounces typed queries for 300 ms above the three-character threshold, aborts stale fetches and guards against late responses. Selection applies validated search-result metadata directly, suppressing a new query caused by the autofilled title. The autocomplete portal mounts inside the modal DOM so its scroll lock permits wheel/trackpad scrolling. Explicit search/results are used only for Edit, where opening immediately searches the draft title and later query changes debounce; the details endpoint and comparison step remain available. Edit Title is an ordinary input with no provider requests.

`createAutofillDraft` applies enabled Create fields, merges genres case-insensitively within existing label limits and retains uploads. The form uses one existing versioned localStorage preference map, with defaults on invalid/unavailable storage. Create exposes lightweight field controls; Edit initializes available changed fields checked, merges genres before comparing and omits unchanged/unavailable proposals. No game/provider data enters browser storage.

The form retains only the latest Create Undo snapshot, changed-field list and any required image state. `AutofillNotice` tracks ten seconds of remaining time, pauses on hover/focus and clears on expiry, replacement, save or unmount. Undo restores only changed metadata and preserves unrelated values. Object URLs retain the existing cleanup lifecycle; restored image previews are recreated from their File when needed.

Covers continue using the existing `url` type and browser delivery. Create retains selected uploads; explicit Edit replacement retires the stored upload through the existing transaction/cleanup ledger. No provider badges, linking state, provider identity columns or migrations are added. The form exposes a temporary dismiss handle so the parent dialog returns from Edit search/comparison to the form before closing. Server APIs, token caching, pacing, validation and manual CRUD are unchanged.

## Phase 9 Steam architecture (planned, not implemented)

Add a server-only Steam client with one shared `STEAM_WEB_API_KEY`. Use the public HTTPS host `api.steampowered.com` and `GetOwnedGames`, including app information and played free games. Resolve vanity URLs through Steam's API; accept only valid ID64 or Steam Community profile routes. Distinguish confirmed empty libraries from inaccessible details where possible; otherwise report that access could not be confirmed.

Add read-only `POST /api/steam/preview` and bounded `POST /api/steam/import` endpoints. Batch and paginate IGDB enrichment through the shared client, matching Steam App IDs via `external_games.external_game_source`. Allow manual IGDB matching and Steam-only import for unresolved games.

Add optional `igdbId`/`steamAppId` to game JSON/validation and nullable unique identity columns in an additive migration. Preserve existing records/title uniqueness and resolve identity conflicts explicitly. On commit recheck identities/current values, apply only confirmed fields and save each game independently through the repository. Return per-row results and retain failed rows for retry. Provider fetches occur outside database transactions. Steam gets its own field-preference map and temporary row overrides; follow SPEC's playtime safeguard.

Provider references: [IGDB API](https://api-docs.igdb.com/), [Steam owned games](https://partner.steamgames.com/doc/webapi/IPlayerService?l=english), [Steam API host and authentication](https://partner.steamgames.com/doc/webapi_overview?l=english).

## Deployment status

Phase 7 deployment is owner-confirmed on Amazon Linux 2023 at `/home/ec2-user/infs3701-game-library`. The documented environment uses Nginx on port 80 and PM2 with one Next.js process on `127.0.0.1:3000`.

Phase 8 cloud deployment and validation are complete, owner-confirmed on 2026-10-02. The [deployment runbook](../deploy/README.md) and supplied PM2, EBS mount, IAM and cleanup configurations remain operational references. EBS snapshots exclude S3 object contents.

`npm ci` generates Prisma Client. `npm run dev` applies migrations first; `npm run build` generates the client and builds with webpack. `npm start` checks storage but does not apply migrations. Local production-build testing requires `STORAGE_MODE=local`, as provided in `.env.example`.
