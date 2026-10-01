# Implementation status and remaining plan

Phases 1–7 are complete. Phase 8 application code and deployment configuration are implemented; EC2/AWS deployment and owner validation remain pending. External metadata remains future work.

## Completed phases

| Phase                    | Status                 | Delivered                                                                                                                  |
| ------------------------ | ---------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 1. Scaffold              | Done                   | Next.js/TypeScript, Tailwind, local shadcn/ui components, bundled fonts, dark tokens and Zod schemas                       |
| 2. In-memory backend     | Done                   | Repository interface, shared in-memory store, development seeds, validated CRUD routes and duplicate-title checks          |
| 3. Core UI               | Done                   | Grid/List/Kanban, title search, combined filters, sorting and empty states                                                 |
| 4. Game dialogs          | Done for initial scope | Add/detail/edit, delete confirmation, placeholder/URL covers and disabled upload option                                    |
| 5. Kanban behavior       | Done                   | Drag-and-drop, keyboard/touch status selector, PATCH updates and rollback on failure                                       |
| 6. Responsive and polish | Done for initial scope | Responsive views/dialogs, focus handling, loading/error/confirmation states and browser checks                             |
| 7. EC2 deployment        | Done                   | Initial application deployed to Amazon Linux 2023, as confirmed by the project owner; production build reported successful |

Phase 7 completion is owner-reported. The EC2 checkout is `/home/ec2-user/infs3701-game-library`. Host service/proxy configurations and deployment screenshots are not versioned here; retain assignment evidence separately. No live EC2 audit was performed for this documentation update.

The active repository now uses Prisma/SQLite. New databases start empty and retain records across application restarts. The original in-memory repository remains available for unit tests.

## Phase 8. Implemented locally, awaiting owner validation

### Phase 8 decisions

- Private S3 uploads and delivery go through Next.js, using IAM and bucket `infs3701-game-library-images` in `us-east-1`.
- Accept JPEG, PNG and WebP up to 5 MiB. Decode/validate still images up to 40 megapixels. Delete replaced/deleted uploads after committing the game mutation.
- Require the separate EBS filesystem at `/mnt/game-library-data`; store SQLite at `/mnt/game-library-data/game-library.sqlite`.
- Back up SQLite with EBS snapshots. Existing in-memory records do not need migration. Snapshotting EBS does not back up S3 image contents.

### Delivered

1. Prisma schema and versioned migration, `SqliteGameRepository`, database-enforced normalized-title uniqueness, preserved CRUD/validation semantics and safe-integer playtime.
2. Lazy server repository, local database setup, explicit production EBS path/UUID checks, PM2 configuration and mount dependency template.
3. Multipart save and image delivery endpoints, bounded requests, content validation, S3 IAM access and durable cleanup ledger. A timer retries failed deletes and expired pending uploads without browser traffic.
4. Upload control, preview, pending/error/retry behavior, preserved uploaded covers on unrelated edits, and removal of obsolete in-memory notices.
5. IAM policies, cleanup service/timer and [owner deployment/validation guide](../deploy/README.md).

### Local verification

- `npm test`: existing query/validation tests plus real SQLite CRUD, reopening and a fresh Node.js process, normalized uniqueness, optional clearing, image replacement/deletion, ambiguous PUT recovery, failed-delete retry, image byte/type/size checks, stream limits and missing-EBS configuration rejection.
- `npm run test:e2e`: isolated temporary SQLite and a local S3 protocol stub, with no real AWS access. Existing CRUD/view/drag/filter/mobile flows plus uploaded-cover preview, delivery, unchanged edit, replacement and failed-save retry. Build first; default port 3101, override with `PLAYWRIGHT_PORT`.
- `npm run lint`, `npm run typecheck`, `npm run build`, migration deployment and dependency audit.

Verified on 2026-09-30: all 9 unit/integration tests and 5 Chromium E2E tests passed, as did lint, typecheck, migration deployment, production build and `git diff --check`. Dependency audit reported zero vulnerabilities. These checks do not prove EC2 mounting, IAM permissions or real S3 behavior.

### Owner validation required before completion

The owner requested to perform live validation. Stop before EC2/AWS changes. Follow [the deployment guide](../deploy/README.md) to mount the attached EBS volume, configure IAM/private S3 and Nginx, deploy migrations and the app, install the cleanup timer, and configure EBS snapshot backups. Record CRUD, application restart, EC2 reboot, missing-mount refusal, upload limits, image delivery/cleanup, anonymous S3 denial and snapshot restore evidence. Phase 8 is not marked complete until those checks pass.

## Phase 9. Metadata autofill: optional, not implemented

1. Add server-side RAWG search and a match preview in Add/Edit.
2. Import selected metadata and cover URLs while keeping every value editable.
3. Preserve manual entry when RAWG is unavailable.

The current `Cover` type reserves `api`, but validation does not yet accept it.

## Phase 10. Assignment extensions: planned, not selected

Review Weeks 1–4 material, then select three justified Going Beyond topics. Implement only those that solve a concrete service concern and record their rationale, configuration and evidence.
