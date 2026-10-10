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

On 2026-10-10, the redesigned IGDB workflow passed 22 unit/integration tests, 17 Chromium E2E tests, lint, typecheck and production build. The additive migration was also applied successfully to the local database without deleting data. Desktop/mobile form, detail, comparison and screenshot-viewer captures were visually inspected. Unit/integration coverage includes expanded normalization, update-mode semantics, cancellation, unique identity persistence, old records, cover retirement and request size limits. Browser coverage includes create search/preview/form, platform selection, draft preservation, all update modes, linking/cancel, failures, responsive layout and existing library/upload interactions.

Run `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, then `PLAYWRIGHT_PORT=3117 npm run test:e2e`. E2E uses temporary SQLite/local covers and mocked provider data. Live IGDB and EC2 deployment verification are separate and remain pending.

## Phase 8 completion

Cloud deployment and validation were confirmed complete by the owner on 2026-10-02. The [deployment runbook](../deploy/README.md) remains the reference for maintenance and repeat validation. This documentation update did not rerun cloud checks.

## Phase 9 IGDB delivered

The original autofill UI is replaced by search/preview/form creation and ID-based metadata updates. The three update modes default to empty-only and offer replacement/manual selection with a read-only diff. Tags merge, uploaded covers may be replaced, selected platforms remain personal, and ID/platform options are saved with confirmed metadata. Expanded fields include companies, summary, storyline and screenshot references. Old badges/preferences/Undo and title-autocomplete components are removed. Steam import is not implemented.

### Setup and manual validation

1. Configure server-only Twitch application credentials as before. No Steam credentials are required.
2. Run `npm run db:deploy` to apply the additive IGDB identity migration; it preserves existing data. Rebuild/restart the application after deploying the new code.
3. Add a game via one-character search, preview and Continue. Select platform chips, edit prose, reorder/remove screenshots, navigate Back and save/reload. Confirm the IGDB identity persists.
4. Update a linked game after changing its local title. Confirm direct-ID retrieval, empty default, mode changes/manual choices, Tags union, screenshot/company replacement and uploaded-cover retirement only after Save. For a legacy game, select a search match explicitly.
5. Exercise provider failure, missing optional metadata, duplicate identity/title, explicit Cancel, unsaved-change confirmation, nested viewer dismissal, failed-save retry and narrow-screen/keyboard controls. Real-provider and deployed checks must be reported separately from mocked tests.

## Phase 9 remaining Steam plan (not implemented)

Steam design decisions were confirmed on 2026-10-02. Steam uses dialog-entered account input and one server-side API key. Every imported field requires checkbox confirmation; missing values default checked, populated replacements default unchecked, and differing existing Steam playtime always requires explicit selection. Separate field preferences persist in local storage. New Steam games default to `PC`/`Unplayed`; unmatched games may import with Steam data alone. See SPEC for complete Steam behavior and DESIGN for its confirmation flow.

1. **Provider clients and identity.** Add a validated server-only Steam client and reuse the delivered IGDB client, token cache and request queue. Reuse persisted IGDB identity; add Steam identity and its unique index without changing existing records. Implement Steam account resolution, owned-games fetching, batched IGDB App ID matching and explicit conflict detection.
2. **Steam import.** Add read-only preview and bounded commit endpoints. Build account entry, game selection, expandable field comparisons, default-field controls and manual IGDB matching. Recheck current values/identity on commit, save independently through the repository, and expose progress, partial results and safe retry. Preserve personal values unless an offered replacement was explicitly checked.
3. **Validation and rollout.** Run automated checks below, apply the additive identity migration and configure provider credentials in local/EC2 environments. Verify a real public Steam account, inaccessible game details, IGDB search and a repeat import in the deployed environment. Keep integrations optional when credentials/providers are unavailable; manual CRUD must still work. Update these four docs with delivered status only after implementation and validation.

### Phase 9 acceptance tests

- Provider tests with mocked responses cover token expiry, limits/retries/timeouts, invalid account input, vanity URLs, empty/inaccessible libraries, pagination, played free games, App ID mappings and missing/ambiguous metadata. No live provider calls or credentials in automated tests.
- Repository/API tests cover migration preservation, provider/title conflicts, selected-field-only writes, stale previews, partial batch failures, linking existing records, repeat imports and ambiguous-response retry. Existing upload cleanup works when a URL replaces an uploaded cover.
- Steam UI/E2E tests cover search/result confirmation, editable previews, per-field comparisons, genres mapped to Tags, upload preservation, default `PC`/`Unplayed`, missing-field defaults, populated replacements and the mandatory unchecked differing-playtime default. Cancellation causes no writes.
- Browser tests cover separate preferences surviving reload, Steam default controls versus temporary row/game selections, unavailable/corrupt local storage, Steam-only import, manual matching, progress/failure retry, keyboard navigation and narrow-screen layout.
- Run `npm test`, lint, typecheck, production build and Chromium E2E with isolated SQLite/local covers. Real-provider/deployment checks are separate from mocked acceptance tests.

IGDB metadata redesign includes the additive IGDB identity migration. Live-provider and deployed validation remain pending. Steam import and its migration are still planned.

## Phase 10

For Phase 10, review Weeks 1–4 course material, select three justified Going Beyond extensions and record their rationale and evidence. None has been selected.

UI refinement includes stable search/viewer dimensions, unclipped focus outlines, cover-led forms/details, personal fields before metadata, plain company inputs, fixed detail actions and return to the library after creation/editing. Browser checks cover confirmed dismissal persistence, cancellation, validation and retry.
