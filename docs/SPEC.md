# Product specification

## Current status

Phase 8 application code now uses Prisma/SQLite and local/S3 cover storage. Local verification is documented in the implementation plan. EC2 deployment of Phase 7 was owner-confirmed; Phase 8 cloud deployment and validation are still pending. Metadata integration remains planned.

A single-user personal game library with no authentication. The server owns the library. SQLite retains records across application restarts. New databases start empty; fictional fixtures remain available for tests but are not automatically seeded.

## Implemented data model

The canonical types and validation are in `src/lib/game.ts`.

| Field                          | Current behavior                                                                                                                                                                      |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`, `createdAt`, `updatedAt` | Server-generated UUID and ISO timestamps                                                                                                                                              |
| `title`                        | Required, trimmed, up to 160 characters                                                                                                                                               |
| `platforms`, `tags`            | Arrays, default empty; up to 30 entries each, 1–60 characters per entry; trimmed and deduplicated case-insensitively                                                                  |
| `status`                       | Unplayed (default), Playing, Completed, Backlog or Dropped                                                                                                                            |
| `releaseDate`                  | Optional valid calendar date in `YYYY-MM-DD` format                                                                                                                                   |
| `playtimeMinutes`              | Optional non-negative safe integer; entered and displayed as hours/minutes                                                                                                            |
| `rating`                       | Optional integer from 1 to 10                                                                                                                                                         |
| `review`                       | Optional trimmed text, up to 10,000 characters                                                                                                                                        |
| `cover`                        | Defaults to `{ type: "placeholder" }`; also accepts `{ type: "url", url: string }` with an HTTP/HTTPS URL up to 2,048 characters; multipart saves create server-owned `upload` covers |

Matching normalized titles identify the same game regardless of platform. Comparison uses Unicode NFKC normalization, trimmed/collapsed whitespace and lowercase. Duplicate titles are rejected; additional platforms belong on the existing record. Tags combine genres and user-defined labels. Forms use removable platform/tag tokens, confirmed with comma, Enter, Tab or blur. Repeated labels are deduplicated case-insensitively.

Optional release date, playtime, rating and review can be cleared. API updates use `null` to clear them.

## Implemented interactions

- Grid shows cover, title, platforms, status and optional rating.
- List adds tags, playtime and release date; secondary metadata is hidden on narrower screens.
- Kanban has five status columns with filtered counts. Dragging or using a card's status selector updates through the normal API. The UI moves immediately and restores the previous record if saving fails.
- Clicking a game opens a detail dialog. Add, edit and delete confirmation use the same dialog system; there are no per-game pages. Successful creation/editing returns to details.
- Loading, empty, no-match, saving and error states are implemented, with a reload action for library errors.

## Implemented search, filters and sorting

All views use the same browser-side query over fetched records. Kanban sorts within each column.

- Search is a case-insensitive substring match on titles only.
- Status, platform, tag and minimum rating filters combine with AND. Status, platform and tag each select one value through direct sidebar controls; selecting an active value again clears it. Rating uses a slider at the top of the sidebar on the existing 1–10 scale, including games at or above the selected value and excluding unrated games. The Any position clears the rating filter and includes unrated games. Platform/tag options come from the library and match stored labels exactly.
- Default sort is recently added. Title sorts alphabetically; release date and timestamps sort newest first; rating and playtime sort highest first. Unset values come last, with title as the tiebreaker.
- View, search and filter settings are not persisted across page reloads.

## Covers and persistence

Covers support the bundled placeholder, browser-loaded HTTP/HTTPS URLs and uploaded images delivered through `/api/covers/:id`. Failed images fall back to the placeholder. JPEG, PNG and WebP uploads are limited to 5 MiB, 40 megapixels and still images. The server validates and decodes the bytes, re-encodes to remove metadata, and rejects unsupported or corrupt files.

Uploads are sent with the game save as multipart data. SQLite stores the cover object reference. Editing without changing an upload preserves it; replacing the cover or deleting the game queues the old object for deletion after the database commit. Failed deletes retry through a durable ledger and scheduled cleanup. Unattached uploads left by a crash expire after 24 hours. A failed save preserves the form and selected image for retry; cancelling before save uploads nothing.

Local mode stores SQLite in `data/game-library.sqlite` and uploaded images in `data/covers/`, creating the cover directory on the first upload. Both survive application restarts; AWS is not required. `LOCAL_COVERS_DIR` allows an override for isolated tests. EC2 configuration requires the separate EBS filesystem at `/mnt/game-library-data`, its UUID, and database `/mnt/game-library-data/game-library.sqlite`. Startup and migration fail if that filesystem is unavailable. Existing in-memory records need no migration.

EBS mode uses S3 bucket `infs3701-game-library-images`, `us-east-1`, through the AWS SDK credential chain. Production uses an EC2 IAM role and private objects, with uploads and delivery routed through Next.js. Bucket privacy does not restrict access to this unauthenticated application's endpoints.

The owner has created and attached the EBS volume and created the bucket. Mounting, IAM, bucket privacy, restart persistence and EBS snapshot backup/restore must still be validated by the owner using [the deployment guide](../deploy/README.md). EBS snapshots cover SQLite, not S3 object contents.

Phase 9 remains optional server-side RAWG autofill with editable imported values; `api` covers remain reserved and rejected by validation. Manual entry remains available. Phase 10 extensions remain unselected.

## Out of scope

Authentication, multiple users, social features, recommendations, store integrations, account sync and dedicated game pages.
