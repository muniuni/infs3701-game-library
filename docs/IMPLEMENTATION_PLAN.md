# Implementation status and remaining plan

The initial in-memory application is implemented and EC2 deployment is complete. Persistent storage and external metadata remain future work.

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

Production starts empty and loses all game records on server restart. Development starts with six fictional fixtures. This is expected until Phase 8.

## Existing verification

- `npm test`: repository CRUD, validation, duplicate identity, clone isolation, optional-field clearing, combined filters and sorting.
- `npm run test:e2e`: Chromium API/UI flows, view switching, drag-and-drop, failed-save rollback, delete confirmation and mobile overflow. Build first and use a disposable local server.
- `npm run lint`, `npm run typecheck`, `npm run build`: static checks and production compilation.

These checks passed during initial implementation. This documentation update reviews source and test coverage; it does not represent a new test run or live deployment verification.

## Phase 8. Persistent storage: planned, not implemented

1. Add SQLite and implement `SqliteGameRepository` behind the existing interface.
2. Store the database on EBS-backed EC2 storage and switch server CRUD to it.
3. Add S3 upload handling, enable the upload form control and store cover references in SQLite.
4. Verify game and uploaded-cover persistence across application and instance restarts.

## Phase 9. Metadata autofill: optional, not implemented

1. Add server-side RAWG search and a match preview in Add/Edit.
2. Import selected metadata and cover URLs while keeping every value editable.
3. Preserve manual entry when RAWG is unavailable.

The current `Cover` type reserves `api`, but validation does not yet accept it.

## Phase 10. Assignment extensions: planned, not selected

Review Weeks 1–4 material, then select three justified Going Beyond topics. Implement only those that solve a concrete service concern and record their rationale, configuration and evidence.
