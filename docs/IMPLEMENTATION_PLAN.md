# Implementation status and remaining plan

## Status

| Phase                     | Status                                                                                                   |
| ------------------------- | -------------------------------------------------------------------------------------------------------- |
| 1–6. Initial application  | Complete: scaffold, validated CRUD, Grid/List/Kanban, dialogs, filters and responsive/accessibility work |
| 7. EC2 deployment         | Complete, owner-confirmed for the initial application                                                    |
| 8. Persistent storage     | Complete: application code, cloud deployment and validation; owner-confirmed               |
| 9. Metadata autofill      | Optional, not implemented                                                                                |
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

UI refinement checks on 2026-10-02 passed lint, typecheck, production build and 6 Chromium E2E tests. The suite includes preview alignment, floating keyboard suggestions, floating success notifications and quick status save/rollback. The previously recorded 12 unit/integration tests were not rerun during this UI session or documentation review.

| Command                                              | Coverage                                                                                                                                                                                         |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm test`                                           | Domain/query behavior, SQLite persistence and uniqueness, optional clearing, local cover persistence/cleanup, storage failure recovery, image validation, request limits and EBS guard rejection |
| `npm run test:e2e`                                   | CRUD, views, drag/rollback, filters/tokens, responsive forms, preview alignment, cover uploads/retry/replacement/cancellation, label suggestions and quick status feedback/rollback                                                                                      |
| `npm run lint`, `npm run typecheck`, `npm run build` | Static checks and production compilation                                                                                                                                                         |

Build before E2E. The suite uses temporary SQLite and local cover files, with no AWS access; default port 3101 can be overridden with `PLAYWRIGHT_PORT`.

## Phase 8 completion

Cloud deployment and validation were confirmed complete by the owner on 2026-10-02. The [deployment runbook](../deploy/README.md) remains the reference for maintenance and repeat validation. This documentation update did not rerun cloud checks.

## Later phases

Phase 9 may add server-side RAWG search with an import preview; imported values must stay editable and manual entry must work when RAWG fails. The reserved `api` cover type is not accepted yet.

For Phase 10, review Weeks 1–4 course material, select three justified Going Beyond extensions and record their rationale and evidence. None has been selected.
