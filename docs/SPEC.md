# Product specification

## Status and scope

Single-user game library with no authentication. Prisma/SQLite persistence and local/S3 cover storage are implemented. Phase 7 EC2 deployment and Phase 8 cloud deployment/validation are complete, owner-confirmed. Phase 9 IGDB autofill is implemented and locally validated; live-provider/deployment validation remains pending. Steam library import remains planned. Assignment extensions are not implemented.

New databases start empty, retain records across application restarts and do not automatically load the fictional fixtures. Local storage remembers IGDB field-selection preferences only; library view/filter settings remain temporary. Steam will have a separate preference set when implemented.

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

Add, details, edit and confirmed delete use dialogs. Platform chips and tag autocomplete suggest existing library values while allowing custom entries. Successful saves open details. Grid, List, Kanban and Details offer quick status changes; Kanban also supports dragging. Status changes apply immediately and roll back on failure. Save, delete and status changes show brief success feedback. Loading, empty, no-match, saving and error states include appropriate reload/reset actions.

## Covers and storage

Create/edit forms offer file upload and replacement through the cover preview, with no URL-entry or cover-removal controls. New games without an upload use the placeholder; edits without a new upload or approved IGDB cover preserve the existing cover. The API still accepts external URLs, and existing URL covers remain displayable. Failed images fall back to the placeholder.

Uploads accept still JPEG, PNG and WebP images up to 5 MiB and 40 megapixels. The server checks the declared format against decoded bytes, re-encodes without metadata and also limits the stored result to 5 MiB.

Uploads are sent with the game save and displayed through `/api/covers/:id`. Unrelated edits preserve the image; replacement or game deletion retires the old object after the database commit. Failed saves retain the form/image for retry. Cancelling before save uploads nothing.

| Mode    | Database                                     | Uploaded images                                                  |
| ------- | -------------------------------------------- | ---------------------------------------------------------------- |
| `local` | `data/game-library.sqlite` by default        | `data/covers/`, created on first upload; no AWS required         |
| `ebs`   | `/mnt/game-library-data/game-library.sqlite` | S3 bucket `infs3701-game-library-images`, `us-east-1` by default |

`DATABASE_URL` can override the local database with an absolute `file:` path; `LOCAL_COVERS_DIR` overrides the local image directory. EBS mode requires the exact separate filesystem mount and configured UUID. External URL images are fetched by the browser in either mode.

Retired objects are deleted immediately when possible. Failed deletions remain in SQLite for `npm run covers:cleanup`; that command also processes pending uploads older than 24 hours. Local mode has no automatic cleanup schedule. Production cleanup uses the supplied service/timer. Bucket privacy does not restrict the unauthenticated application image API.

Phase 8 completion was confirmed by the owner on 2026-10-02. See the [deployment runbook](../deploy/README.md) for setup and validation procedures. EBS snapshots do not contain S3 image data.

## Phase 9 IGDB autofill (implemented)

IGDB search in Add/Edit proposes only title, release date, cover and genres. Genres use the existing `tags` field and its validation/filtering; no separate genre field is added. IGDB does not supply platforms, status, personal rating, review or playtime. Release date uses the first release date only when IGDB supplies a complete calendar date; partial dates stay unset. Covers use HTTPS IGDB image URLs through the existing `url` cover type, without downloading into local/S3 storage.

**Add Game:** Title is an accessible autocomplete entry point. A trimmed query of at least three characters searches after a 300 ms debounce. Suggestions show cover, title and release year, support keyboard/mouse selection and can be dismissed while retaining manual text. Query changes cancel stale browser requests; outdated responses never change the draft. Selecting a result immediately applies available enabled fields, without confirmation. Suggestions scroll with trackpad/wheel input within the modal; no manual-search action or result-count message is shown.

Create autofill may replace title and release date. Genres merge into Tags, preserving existing spelling/order and deduplicating case-insensitively; existing manual tags take priority within the 30-label limit. A selected upload always takes precedence. IGDB covers may replace a placeholder or external URL. All values remain editable, and only Create commits them.

**Edit Game:** Title editing never automatically queries IGDB. Autofill beside Title opens search/results immediately using the draft title, then debounces search as its query changes. No Search button is required. Outside clicks, Escape and closing the search view return to the draft. Available differing fields start checked, including populated replacements. Identical or unavailable values are omitted from changes. Selecting genres in Edit appends new genres, preserving and deduplicating existing Tags, and a cover may replace an upload only when checked. Apply selected updates the draft; Save is the only commit.

Autofill fields provides lightweight Create preference checkboxes for title, release date, cover and genres. The existing versioned IGDB localStorage preferences are reused, defaulting to all enabled when absent/invalid/unavailable. Edit comparison choices also update stored field preferences, but each Edit comparison initializes available changes checked. Persist only field choices, never results, draft values, provider IDs or source/synchronization state.

Create application shows a floating “Autofilled X fields · Undo” notice, counting changed fields. Undo restores the changed metadata from immediately before the latest autofill while leaving unrelated fields intact. It lasts about ten seconds of unpaused time, pausing on hover or keyboard focus. A later autofill supersedes the snapshot; Create/Save or dialog close clears it. Snapshot/upload state is temporary in-dialog state only. Cancel writes nothing. Manual entry, validation, uploads and retry remain available during provider failure.

## Phase 9 Steam import (planned, not implemented)

Steam import accepts a Steam ID64 or Steam Community profile URL, including vanity URLs. One server-side Steam Web API key is shared by the application. Game details must be publicly accessible; unavailable game details show a clear message rather than reporting a successful empty import. A confirmed public empty library has its own empty state. Fetch owned games including played free games; this is not a wishlist, purchase-history or account-sync feature.

The import preview allows game selection and field selection per game. New games start selected, with platform `PC` and status `Unplayed`; existing games start unselected and retain platform/status. Steam supplies title and total playtime in minutes. IGDB enrichment matches Steam App IDs first; ambiguous or absent matches offer manual IGDB search and never select a fuzzy title match automatically. Games may be imported without an IGDB match using the Steam title/playtime and leaving unavailable metadata empty. When matched, IGDB proposes title, release date, cover and genres. A new game's required title must be present before import.

For existing games, imports propose missing metadata and permit explicit replacement of populated metadata through unchecked checkboxes. Steam playtime is a replacement proposal, not added to existing playtime: current totals may include non-Steam playtime. Missing playtime initially defaults checked; differing existing playtime always starts unchecked, regardless of saved preferences. No status is inferred from playtime. Status, rating and review are never overwritten by import.

IGDB field-selection preferences persist across browser sessions; Steam will use a separate preference set. Store only field choices, not account input, credentials, preview data or individual game selections. Preferences initialize each new confirmation; row-specific overrides affect that preview only. Replacement safeguards take precedence over remembered defaults. Invalid or unavailable local storage falls back to initial defaults.

The Steam implementation will persist optional IGDB and Steam App IDs for repeat-import matching. IGDB autofill currently saves only approved metadata through existing CRUD, without provider identity columns or a database migration. Match stored identifiers first, then the existing normalized-title rule; title uniqueness remains enforced. Conflicting identifiers or multiple candidate records require explicit resolution or skipping in the preview. Confirmed imports may link an existing record without changing its metadata. Repeat imports do not create duplicate records. Each selected game saves independently and reports success or failure; retry retains failed selections and excludes successful rows. Cancel before confirmation writes no games or covers. Provider failures preserve manual workflows and allow retry or Steam-only import when Steam data is available.

## Out of scope

Authentication, multiple users, social features, recommendations, scheduled store/account sync and dedicated game pages. Phase 9 adds manual Steam import only; RAWG integration is not planned.
