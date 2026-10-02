# Product specification

## Status and scope

Single-user game library with no authentication. Prisma/SQLite persistence and local/S3 cover storage are implemented. Phase 7 EC2 deployment is owner-confirmed; Phase 8 cloud deployment and validation remain pending. RAWG integration and assignment extensions are not implemented.

New databases start empty, retain records across application restarts and do not automatically load the fictional fixtures. No persistent browser storage is used.

## Data model

Types and validation are defined in `src/lib/game.ts`.

| Field                          | Behavior                                                                                                    |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `id`, `createdAt`, `updatedAt` | Server-generated UUID and ISO timestamps                                                                    |
| `title`                        | Required, trimmed, 1–160 characters                                                                         |
| `platforms`, `tags`            | Default empty; up to 30 labels each, 1–60 characters per label; trimmed and deduplicated case-insensitively |
| `status`                       | Unplayed (default), Playing, Completed, Backlog or Dropped                                                  |
| `releaseDate`                  | Optional valid calendar date, `YYYY-MM-DD`                                                                  |
| `playtimeMinutes`              | Optional non-negative safe integer, entered/displayed as hours and minutes                                  |
| `rating`                       | Optional integer, 1–10                                                                                      |
| `review`                       | Optional trimmed text, up to 10,000 characters                                                              |
| `cover`                        | Placeholder (default), HTTP/HTTPS URL up to 2,048 characters, or server-created upload reference            |

Title identity uses NFKC normalization, collapsed whitespace and lowercase. Duplicate titles are rejected regardless of platform; edit the existing game's platforms instead. PATCH accepts `null` to clear release date, playtime, rating and review. Upload references cannot be supplied through JSON; the reserved `api` cover type is also rejected.

## Library behavior

Grid, List and five-column Kanban share browser-side search, filters and sorting. Search matches title substrings case-insensitively. Status, platform, tag and minimum rating combine with AND; each label filter selects one exact stored value. Minimum rating excludes unrated games; Any includes them.

Default sort is recently added. Title sorts alphabetically; dates/timestamps sort newest first, rating/playtime highest first. Unset values come last, with title as the tiebreaker. View/search/filter settings reset on page reload.

Add, details, edit and confirmed delete use dialogs. Successful saves open details. Kanban supports dragging and a status selector, applies changes immediately and rolls back on failure. Loading, empty, no-match, saving and error states include appropriate reload/reset actions.

## Covers and storage

Create/edit forms offer file upload and replacement through the cover preview, with no URL-entry or cover-removal controls. New games without an upload use the placeholder; edits without a new upload preserve the existing cover. The API still accepts external URLs, and existing URL covers remain displayable. Failed images fall back to the placeholder.

Uploads accept still JPEG, PNG and WebP images up to 5 MiB and 40 megapixels. The server checks the declared format against decoded bytes, re-encodes without metadata and also limits the stored result to 5 MiB.

Uploads are sent with the game save and displayed through `/api/covers/:id`. Unrelated edits preserve the image; replacement or game deletion retires the old object after the database commit. Failed saves retain the form/image for retry. Cancelling before save uploads nothing.

| Mode    | Database                                     | Uploaded images                                                  |
| ------- | -------------------------------------------- | ---------------------------------------------------------------- |
| `local` | `data/game-library.sqlite` by default        | `data/covers/`, created on first upload; no AWS required         |
| `ebs`   | `/mnt/game-library-data/game-library.sqlite` | S3 bucket `infs3701-game-library-images`, `us-east-1` by default |

`DATABASE_URL` can override the local database with an absolute `file:` path; `LOCAL_COVERS_DIR` overrides the local image directory. EBS mode requires the exact separate filesystem mount and configured UUID. External URL images are fetched by the browser in either mode.

Retired objects are deleted immediately when possible. Failed deletions remain in SQLite for `npm run covers:cleanup`; that command also processes pending uploads older than 24 hours. Local mode has no automatic cleanup schedule. Production includes a timer template that must be installed. Bucket privacy does not restrict the unauthenticated application image API.

The owner reports the EBS volume and bucket are created. Mounting, IAM, S3 privacy, reboot persistence and EBS snapshot backup/restore await [owner validation](../deploy/README.md). EBS snapshots do not contain S3 image data.

## Out of scope

Authentication, multiple users, social features, recommendations, store/account sync and dedicated game pages. RAWG autofill remains optional future work; manual entry must remain available.
