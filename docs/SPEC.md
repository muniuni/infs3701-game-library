# Product specification

## Current status

The initial in-memory version is implemented. EC2 deployment (Phase 7) is complete, as confirmed by the project owner. Persistent storage and metadata integration remain planned.

A single-user personal game library with no authentication. The server owns the library; browser refreshes retain records, but restarting the server clears them. Development starts with six fictional games; production starts empty.

## Implemented data model

The canonical types and validation are in `src/lib/game.ts`.

| Field                          | Current behavior                                                                                                                 |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `id`, `createdAt`, `updatedAt` | Server-generated UUID and ISO timestamps                                                                                         |
| `title`                        | Required, trimmed, up to 160 characters                                                                                          |
| `platforms`, `tags`            | Arrays, default empty; up to 30 entries each, 1–60 characters per entry; trimmed and deduplicated case-insensitively             |
| `status`                       | Unplayed (default), Playing, Completed, Backlog or Dropped                                                                       |
| `releaseDate`                  | Optional valid calendar date in `YYYY-MM-DD` format                                                                              |
| `playtimeMinutes`              | Optional non-negative safe integer; entered and displayed as hours/minutes                                                       |
| `rating`                       | Optional integer from 1 to 10                                                                                                    |
| `review`                       | Optional trimmed text, up to 10,000 characters                                                                                   |
| `cover`                        | Defaults to `{ type: "placeholder" }`; also accepts `{ type: "url", url: string }` with an HTTP/HTTPS URL up to 2,048 characters |

Matching normalized titles identify the same game regardless of platform. Comparison uses Unicode NFKC normalization, trimmed/collapsed whitespace and lowercase. Duplicate titles are rejected; additional platforms belong on the existing record. Tags combine genres and user-defined labels. Forms accept comma-separated platforms and tags.

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
- Status, platform, tag and exact rating filters combine with AND. Each filter selects one value. Platform/tag options come from the library and match stored labels exactly.
- Default sort is recently added. Title sorts alphabetically; release date and timestamps sort newest first; rating and playtime sort highest first. Unset values come last, with title as the tiebreaker.
- View, search and filter settings are not persisted across page reloads.

## Covers and planned features

Implemented covers are a bundled SVG placeholder and browser-loaded external URLs. Failed images fall back to the placeholder. Upload appears only as a disabled form option.

The TypeScript `Cover` type also includes `upload` and `api`, but current input validation rejects both. There is no upload endpoint or metadata search.

Planned work is SQLite game storage on EBS-backed EC2 storage, S3 uploads, and optional server-side RAWG autofill with editable imported values. Manual entry must remain available.

## Out of scope

Authentication, multiple users, social features, recommendations, store integrations, account sync and dedicated game pages.
