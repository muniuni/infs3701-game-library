# Game Library

A single-user Next.js application implementing the initial in-memory scope in `docs/`. It uses React, TypeScript, Tailwind CSS and locally styled shadcn/ui Button and Dialog components backed by Radix primitives. Jersey 10 and Manrope are bundled locally through Fontsource.

## Run locally

Use Node.js 20.9 or later (Node.js 24 LTS recommended).

```sh
npm ci
npm run dev
```

Open http://localhost:3000. Development mode starts with six fictional sample games. A production process starts empty. All game data lives in the server process, survives browser refreshes, and disappears when that process restarts. Run a single app process; separate processes do not share the library.

```sh
npm run build
npm start
```

## Implemented

Grid, List and Kanban views share title search, status/platform/tag/exact-rating filters and sorting. Title sorts alphabetically; other sorts put highest/newest values first and unset values last. Kanban supports drag-and-drop plus a status selector for keyboard and touch use. A failed update restores the previous status.

Add, view, edit and delete use centered dialogs with keyboard focus containment, Escape dismissal and focus restoration. Deletion requires confirmation. Games have multiple platforms and tags. Matching normalized titles are treated as one game regardless of platform; edit its platforms instead of creating another record. Optional fields can be cleared. Playtime is stored as whole minutes.

Covers support bundled placeholders and HTTP/HTTPS URLs, with a fallback for broken images. Upload is a disabled future option. No SQLite, EBS, S3, RAWG, authentication or persistent browser storage is implemented.

## API and storage boundary

- `GET /api/games`, `POST /api/games`
- `GET /api/games/:id`, `PATCH /api/games/:id`, `DELETE /api/games/:id`

`src/lib/repository.ts` defines `GameRepository` and implements the in-memory store. `src/lib/server-repository.ts` shares one instance across route handlers. Routes return 400 for invalid input, 404 for missing records and 409 for duplicate titles. PATCH accepts partial fields and uses `null` to clear optional values. Created IDs and timestamps are server-owned. Remote covers are fetched by the browser, not proxied by the app.

## Verification

```sh
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

The end-to-end suite runs against the production server on port 3000 and covers the HTTP API, dialogs, list/grid/board switching, drag-and-drop, failed-update rollback, deletion and mobile overflow. Use a disposable local server: tests create and remove their own fixtures.

## Initial EC2 deployment

No cloud resources have been provisioned by this implementation. On a single Linux EC2 instance with Node.js and npm installed:

1. Copy or clone this project onto the instance.
2. Run `npm ci` and `npm run build`.
3. Run `npm start` under a service manager so the app restarts after failures or instance reboot. Use the repository directory as the working directory.
4. Forward HTTP port 80 to the service on port 3000 using your instance's reverse proxy, and allow inbound HTTP on port 80 in its security group. The app has no authentication, as specified for this assignment.
5. Open the instance's public HTTP address and verify create, read, edit, status movement and confirmed delete. Restart the service and verify that the library resets.
6. Capture the deployed views and configuration evidence for the assignment.

Actual deployment and public-address verification require an EC2 target and AWS access. Later storage and assignment-specific extensions remain outside this implementation.
