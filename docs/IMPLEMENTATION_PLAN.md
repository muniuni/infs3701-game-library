# Implementation status and remaining plan

## Status

| Phase                     | Status                                                                                                   |
| ------------------------- | -------------------------------------------------------------------------------------------------------- |
| 1–6. Initial application  | Complete: scaffold, validated CRUD, Grid/List/Kanban, dialogs, filters and responsive/accessibility work |
| 7. EC2 deployment         | Complete, owner-confirmed for the initial application                                                    |
| 8. Persistent storage     | Complete: application code, cloud deployment and validation; owner-confirmed                             |
| 9. IGDB and Steam import  | Implemented locally: IGDB autofill and Steam import; live import validation pending                                                 |
| 10. Assignment extensions | Not selected or implemented                                                                              |

The active repository uses Prisma/SQLite; new databases start empty and survive process restarts. The original in-memory implementation remains a test double.

## Phase 8 delivered

- Prisma schema/migration, `SqliteGameRepository`, database-enforced normalized-title uniqueness and preserved field validation/clearing.
- Local SQLite at `data/game-library.sqlite` and uploaded covers at `data/covers/`, without AWS. EBS mode requires `/mnt/game-library-data/game-library.sqlite` and its separate mounted filesystem/UUID; covers use private S3 through IAM.
- Multipart saves, validated JPEG/PNG/WebP images up to 5 MiB and 40 megapixels, application image delivery, preview and failed-save retry.
- Transactional cover references and a durable cleanup ledger. Mutations attempt retired-object deletion; `npm run covers:cleanup` retries failed deletes and pending uploads older than 24 hours.
- PM2 configuration, mount dependency, IAM policies, cleanup service/timer and [deployment guide](../deploy/README.md). Cloud deployment and validation are owner-confirmed complete. Local mode has no automatic cleanup timer.

No migration of previous in-memory records is required. EBS snapshot instructions cover the database, not historical S3 image contents.

## Verification

On 2026-10-10, the redesigned IGDB workflow passed 22 unit/integration tests, 17 Chromium E2E tests, lint, typecheck and production build. The additive migration was also applied successfully to the local database without deleting data. Desktop/mobile search/loading, save-confirmation, form, detail, comparison and screenshot-viewer captures were visually inspected. Unit/integration coverage includes expanded normalization, update-mode semantics, cancellation, unique identity persistence, old records, cover retirement and request size limits. Browser coverage includes create search/preview/form, platform selection, draft preservation, all update modes, linking/cancel, failures, responsive layout and existing library/upload interactions.

Run `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, then `PLAYWRIGHT_PORT=3117 npm run test:e2e`. E2E uses temporary SQLite/local covers and mocked provider data. Live IGDB and EC2 deployment verification are separate and remain pending.

## Phase 8 completion

Cloud deployment and validation were confirmed complete by the owner on 2026-10-02. The [deployment runbook](../deploy/README.md) remains the reference for maintenance and repeat validation. This documentation update did not rerun cloud checks.

## Phase 9 IGDB delivered

The original autofill UI is replaced by search/preview/form creation and ID-based metadata updates. The three update modes default to empty-only and offer replacement/manual selection with a read-only diff. Tags merge, uploaded covers may be replaced, selected platforms remain personal, and ID/platform options are saved with confirmed metadata. Expanded fields include companies, summary, storyline and screenshot references. Old badges/preferences/Undo and title-autocomplete components are removed. Steam import is delivered below.

UI refinement includes stable search/viewer dimensions, unclipped focus outlines, cover-led forms/details, personal fields before metadata, plain company inputs, fixed detail actions and return to the library after creation/editing. Browser checks cover confirmed dismissal persistence, Cancel-triggered confirmation, stable search loading, validation and retry.

### Setup and manual validation

1. Configure server-only Twitch application credentials through Secrets Manager on EC2 or `.env` locally. No Steam credentials are required for IGDB autofill.
2. Run `npm run db:deploy` to apply the additive IGDB identity migration; it preserves existing data. Rebuild/restart the application after deploying the new code.
3. Add a game via one-character search, preview and Continue. Select platform chips, edit prose, reorder/remove screenshots, navigate Back and save/reload. Confirm the IGDB identity persists.
4. Update a linked game after changing its local title. Confirm direct-ID retrieval, empty default, mode changes/manual choices, Tags union, screenshot/company replacement and uploaded-cover retirement only after Save. For a legacy game, select a search match explicitly.
5. Exercise provider failure, missing optional metadata, duplicate identity/title, explicit Cancel, unsaved-change confirmation, nested viewer dismissal, failed-save retry and narrow-screen/keyboard controls. Real-provider and deployed checks must be reported separately from mocked tests.

## Phase 9 Steam delivered

Implemented remembered account input, full-library enrichment before a unified selection/review list, global modes with explicit Customize per game, temporary row overrides, inline Status drafts, manual matching, Steam-only fallback and partial-save recovery. Steam ID and global mode are stored in local storage; no account setting is stored in the database. New games default to Steam/Unplayed. Update playtime explicitly selects changed linked records and selects only total playtime for metadata updates while retaining independently edited Status drafts. The additive migration preserves existing data and adds Steam identity plus durable retry receipts. It was applied successfully to the local database without deleting data.

Local verification includes account/URL validation, inaccessible/empty libraries, hidden playtime, retry/error privacy, IGDB external-ID matching, mode safeguards, tag/platform unions, identity conflicts, stale previews and lost-response replay. Chromium scenarios cover new imports, repeat playtime updates, remembered account/global mode, inline Status, mode precedence/restoration, loading bounds, Cancel confirmation, narrow layouts, metadata failure, partial success/retry and IGDB-discovered existing records. Existing IGDB and library scenarios also pass. Latest automated result: 29 unit/integration tests and 23 Chromium E2E tests, plus lint, typecheck and production build. Desktop/mobile import-review screenshots were inspected. These use mocked providers and isolated databases; no real Steam or new EC2 validation is claimed.

Steam import compatibility fix: operation IDs now support HTTP deployments without `crypto.randomUUID()`. ID creation failures appear as recoverable row errors. Browser regression coverage exercises the fallback, distinct IDs, lost-response retry with the same ID and recovery after unavailable browser crypto. Validation passed 34 unit/integration tests, 24 Chromium E2E tests, lint, typecheck, production build and `git diff --check`. Deployed validation remains pending.

### Setup and remaining live validation

1. Configure `STEAM_WEB_API_KEY` through Secrets Manager on EC2 or `.env` locally. Configure `IGDB_CLIENT_ID` and `IGDB_CLIENT_SECRET` through the same source for enrichment; Steam-only import remains available without IGDB. No `NEXT_PUBLIC_` keys or Steam account environment variable are used.
2. Apply `npm run db:deploy`, rebuild and restart. `npm run dev` applies migrations automatically; production start does not.
3. Enter your profile URL/ID64 with public game details. Import a selection and verify Steam identity, metadata, chosen Status and default platform after reload. Reopen Import Steam to verify automatic account loading; exercise Change account and Forget account.
4. Repeat import after acquiring a game or accumulating playtime. Verify new selection, explicit playtime replacement, personal-field preservation and no duplicates.
5. Verify unavailable game details and a real IGDB App ID match in the deployed environment. These live checks remain pending.

## Secrets Manager integration

Implemented lazy role-based retrieval of both provider secrets in `us-east-1`, a shared five-minute memory cache, concurrent-read deduplication, validated JSON and safe 503 failures. Local environment support is retained with explicit source selection for local production tests. The EC2 PM2 configuration selects AWS; an IAM policy template and [deployment instructions](../deploy/README.md#6-provider-secrets) are included. No database migration is required for this integration.

On 2026-10-10, validation passed 34 unit/integration tests, 23 Chromium E2E tests, lint, typecheck, production build and `git diff --check`. Credential tests cover local source selection, production precedence, secret names, caching/expiry, concurrent reads, malformed/missing values, retry after failure, provider error sanitization and IGDB token renewal after secret rotation. Live EC2 role access, Secrets Manager reads and real-provider behavior remain pending.

## JSON library export

Implemented Import / Export with the existing Steam workflow and full-library JSON downloads. Export now requires confirmation in the shared compact dialog, with Cancel/Export JSON, in-dialog retry and focus restoration. Export uses a fresh repository snapshot and an explicit field list excluding images, image URLs, storage keys, internal IDs and secrets. Optional values, arrays, personal records and external provider IDs follow the version 1 contract in SPEC. Browser checks cover downloads under filtering, records added after page load, empty libraries, keyboard/mobile use, export retry and the existing Steam workflow. On 2026-10-11, validation passed 36 unit/integration tests, 26 Chromium E2E tests, lint, typecheck, production build and `git diff --check`. Desktop/mobile menu screenshots were inspected. The confirmation follow-up passed 10 targeted export/Steam Chromium tests, lint, typecheck, production build and `git diff --check`; desktop/mobile confirmation screenshots were inspected. Cancellation tests verify no export request or download before confirmation and focus restoration. Live deployment validation remains pending.

## Phase 10

For Phase 10, review Weeks 1–4 course material, select three justified Going Beyond extensions and record their rationale and evidence. None has been selected.
