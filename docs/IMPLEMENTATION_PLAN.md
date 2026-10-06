# Implementation status and remaining plan

## Status

| Phase                     | Status                                                                                                   |
| ------------------------- | -------------------------------------------------------------------------------------------------------- |
| 1–6. Initial application  | Complete: scaffold, validated CRUD, Grid/List/Kanban, dialogs, filters and responsive/accessibility work |
| 7. EC2 deployment         | Complete, owner-confirmed for the initial application                                                    |
| 8. Persistent storage     | Complete: application code, cloud deployment and validation; owner-confirmed                             |
| 9. IGDB and Steam import  | Partial: IGDB autofill implemented; Steam import planned                                                 |
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

IGDB implementation checks on 2026-10-03 passed 20 unit/integration tests, 14 Chromium E2E tests, lint, typecheck and production build. Tests use synthetic/mocked provider data; live IGDB credentials and EC2 deployment were not validated.

| Command                                              | Coverage                                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm test`                                           | IGDB normalization/token renewal/request pacing/queue bounds/preferences, domain/query behavior, SQLite persistence and uniqueness, optional clearing, local cover persistence/cleanup, storage failure recovery, image validation, request limits and EBS guard rejection                                                                                                           |
| `npm run test:e2e`                                   | Create autocomplete/wheel scrolling/cancellation/preferences/Undo/upload preservation, Edit automatic search/comparison dismissal/checked defaults/tag merging/URL replacement/provider failure, CRUD, views, drag/rollback, filters/tokens, responsive forms, preview alignment, cover uploads/retry/replacement/cancellation, label suggestions and quick status feedback/rollback |
| `npm run lint`, `npm run typecheck`, `npm run build` | Static checks and production compilation                                                                                                                                                                                                                                                                                                                                             |

Build before E2E. The suite uses temporary SQLite and local cover files, with no AWS access; default port 3101 can be overridden with `PLAYWRIGHT_PORT`.

## Phase 8 completion

Cloud deployment and validation were confirmed complete by the owner on 2026-10-02. The [deployment runbook](../deploy/README.md) remains the reference for maintenance and repeat validation. This documentation update did not rerun cloud checks.

## Phase 9 IGDB delivered

Implemented server-side IGDB search/details, cached Twitch tokens, a process-wide bounded request queue, response normalization and safe provider errors. Create supports debounced Title autocomplete, immediate selection, genre merging, upload precedence, field preferences and ten-second Undo. Edit supports Autofill beside Title with immediate search, checked comparisons, additive genres and draft-preserving dismissal. Both apply editable draft changes without provider linking or schema changes. URL covers reuse existing CRUD and upload retirement. Steam clients/import, provider identity columns and their migration remain unimplemented.

### Setup and manual validation

1. Register a Twitch application with two-factor authentication and a Confidential client type; generate its Client ID and Client Secret. IGDB does not use the redirect URL; its setup guide permits `localhost`. See [IGDB setup](https://api-docs.igdb.com/#account-creation).
2. Set `IGDB_CLIENT_ID` and `IGDB_CLIENT_SECRET` in ignored `.env.local` for development, or the server environment for production. No `NEXT_PUBLIC_` variables or Steam key are needed. Restart `npm run dev`, or rebuild/start production and refresh PM2's environment using the deployment runbook. No new database migration is required.
3. In Add, type at least three Title characters and select a suggestion with mouse or keyboard. Verify direct draft updates, merged personal Tags, selected-upload precedence and Undo. Adjust Autofill fields, reload and confirm preferences persist. Verify wheel/trackpad scrolling, dismissal and that Cancel writes nothing.
4. In Edit, change Title and verify no automatic IGDB query. Open Autofill and verify results appear automatically. Select a game, inspect checked current/proposed comparisons and merged Tags. Click outside to return to the draft without closing Edit. Apply selected, then Save/reload. Verify a checked URL-cover replacement retires a prior upload. Without credentials or with failed search, manual Create/Edit must still work.

## Phase 9 remaining Steam plan (not implemented)

Steam design decisions were confirmed on 2026-10-02. Steam uses dialog-entered account input and one server-side API key. Every imported field requires checkbox confirmation; missing values default checked, populated replacements default unchecked, and differing existing Steam playtime always requires explicit selection. Separate field preferences persist in local storage. New Steam games default to `PC`/`Unplayed`; unmatched games may import with Steam data alone. See SPEC for complete Steam behavior and DESIGN for its confirmation flow.

1. **Provider clients and identity.** Add a validated server-only Steam client and reuse the delivered IGDB client, token cache and request queue. Add optional persisted provider IDs and unique indexes without changing existing records. Implement Steam account resolution, owned-games fetching, batched IGDB App ID matching and explicit conflict detection.
2. **Steam import.** Add read-only preview and bounded commit endpoints. Build account entry, game selection, expandable field comparisons, default-field controls and manual IGDB matching. Recheck current values/identity on commit, save independently through the repository, and expose progress, partial results and safe retry. Preserve personal values unless an offered replacement was explicitly checked.
3. **Validation and rollout.** Run automated checks below, apply the additive identity migration and configure provider credentials in local/EC2 environments. Verify a real public Steam account, inaccessible game details, IGDB search and a repeat import in the deployed environment. Keep integrations optional when credentials/providers are unavailable; manual CRUD must still work. Update these four docs with delivered status only after implementation and validation.

### Phase 9 acceptance tests

- Provider tests with mocked responses cover token expiry, limits/retries/timeouts, invalid account input, vanity URLs, empty/inaccessible libraries, pagination, played free games, App ID mappings and missing/ambiguous metadata. No live provider calls or credentials in automated tests.
- Repository/API tests cover migration preservation, provider/title conflicts, selected-field-only writes, stale previews, partial batch failures, linking existing records, repeat imports and ambiguous-response retry. Existing upload cleanup works when a URL replaces an uploaded cover.
- Steam UI/E2E tests cover search/result confirmation, editable previews, per-field comparisons, genres mapped to Tags, upload preservation, default `PC`/`Unplayed`, missing-field defaults, populated replacements and the mandatory unchecked differing-playtime default. Cancellation causes no writes.
- Browser tests cover separate preferences surviving reload, Steam default controls versus temporary row/game selections, unavailable/corrupt local storage, Steam-only import, manual matching, progress/failure retry, keyboard navigation and narrow-screen layout.
- Run `npm test`, lint, typecheck, production build and Chromium E2E with isolated SQLite/local covers. Real-provider/deployment checks are separate from mocked acceptance tests.

IGDB autofill has been implemented without schema changes. Live-provider and deployed validation remain pending. Steam import and its migration are still planned.

## Phase 10

For Phase 10, review Weeks 1–4 course material, select three justified Going Beyond extensions and record their rationale and evidence. None has been selected.
