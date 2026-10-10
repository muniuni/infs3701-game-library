# Product specification

## Status and scope

Single-user game library with no authentication. Prisma/SQLite persistence and local/S3 cover storage are implemented. Phase 7 EC2 deployment and Phase 8 cloud deployment/validation are complete, owner-confirmed. Phase 9 IGDB autofill is implemented and locally validated; live-provider/deployment validation remains pending. Steam library import is implemented; live Steam/IGDB import validation remains pending. Assignment extensions are not implemented.

New databases start empty, retain records across application restarts and do not automatically load the fictional fixtures. IGDB update modes and field selections are temporary dialog state. Library view/filter settings remain temporary. Steam remembers its account ID and global update mode in local storage.

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
| `steamAppId` | Optional unique Steam App ID, saved with confirmed imports |
| `igdbId`                       | Optional positive integer, unique across linked games; saved with the game draft                             |
| `availablePlatforms`           | Up to 100 provider platform ID/name pairs; distinct from selected `platforms`                               |
| `developers`, `publishers`     | Optional arrays, up to 50 names of 160 characters each                                                      |
| `summary`, `storyline`         | Optional separate trimmed texts, up to 20,000 characters each; unrelated to personal Review                 |
| `screenshots`                  | Optional ordered array of up to 30 validated IGDB image IDs                                                 |
| `cover`                        | Placeholder (default), HTTP/HTTPS URL up to 2,048 characters, or server-created upload reference            |

Title identity uses NFKC normalization, collapsed whitespace and lowercase. Duplicate titles are rejected regardless of platform; edit the existing game's platforms instead. PATCH accepts `null` to clear release date, playtime, rating, review, summary, storyline and IGDB identity. Empty arrays clear collection fields. Upload references cannot be supplied through JSON; the reserved `api` cover type is also rejected.

## Library behavior

Grid, List and five-column Kanban share browser-side search, filters and sorting. Search matches title substrings case-insensitively. Status, platform, tag and minimum rating combine with AND; each label filter selects one exact stored value. Minimum rating excludes unrated games; Any includes them.

Default sort is recently added. Title sorts alphabetically; dates/timestamps sort newest first, rating/playtime highest first. Unset values come last, with title as the tiebreaker. View/search/filter settings reset on page reload.

Add, details, edit and confirmed delete use dialogs. Platform chips and tag autocomplete suggest existing library values while allowing custom entries. Successful creation and editing return to the library. Grid, List, Kanban and Details offer quick status changes; Kanban also supports dragging. Status changes apply immediately and roll back on failure. Save, delete and status changes show brief success feedback. Loading, empty, no-match, saving and error states include appropriate reload/reset actions.

## Covers and storage

Create/edit forms offer file upload and replacement through the cover preview, with no URL-entry or cover-removal controls. New games without an upload use the placeholder; edits without a new upload or approved IGDB cover preserve the existing cover. The API still accepts external URLs, and existing URL covers remain displayable. Failed images fall back to the placeholder.

Uploads accept still JPEG, PNG and WebP images up to 5 MiB and 40 megapixels. The server checks the declared format against decoded bytes, re-encodes without metadata and also limits the stored result to 5 MiB.

Uploads are sent with the game save and displayed through `/api/covers/:id`. Unrelated edits preserve the image; replacement or game deletion retires the old object after the database commit. Failed saves retain the form/image for retry. Opening the unsaved-change confirmation uploads nothing. Discard abandons the draft without uploading; Save and close saves the game and selected cover.

| Mode    | Database                                     | Uploaded images                                                  |
| ------- | -------------------------------------------- | ---------------------------------------------------------------- |
| `local` | `data/game-library.sqlite` by default        | `data/covers/`, created on first upload; no AWS required         |
| `ebs`   | `/mnt/game-library-data/game-library.sqlite` | S3 bucket `infs3701-game-library-images`, `us-east-1` by default |

`DATABASE_URL` can override the local database with an absolute `file:` path; `LOCAL_COVERS_DIR` overrides the local image directory. EBS mode requires the exact separate filesystem mount and configured UUID. External URL images are fetched by the browser in either mode.

Retired objects are deleted immediately when possible. Failed deletions remain in SQLite for `npm run covers:cleanup`; that command also processes pending uploads older than 24 hours. Local mode has no automatic cleanup schedule. Production cleanup uses the supplied service/timer. Bucket privacy does not restrict the unauthenticated application image API.

Phase 8 completion was confirmed by the owner on 2026-10-02. See the [deployment runbook](../deploy/README.md) for setup and validation procedures. EBS snapshots do not contain S3 image data.

## Phase 9 IGDB autofill (implemented)

IGDB supplies title, complete first release date, cover, genres mapped to Tags, available platforms, developer/publisher names, summary, storyline and screenshots. Personal platform selections, status, rating, review and playtime are never inferred. Partial release dates remain unset. Covers and screenshots use HTTPS IGDB URLs without copying image bytes into local/S3 storage.

**Add:** One dialog contains search, game preview and editable form. Nonblank title input searches after 150 ms, with IME composition suppression, explicit Search/Enter, keyboard result selection and stale request cancellation. Add manually carries the query into Title and remains available during provider failure. Selecting a result fetches its details and shows a preview; Continue fills the draft. The large cover and Title precede Status, Platforms, Playtime, Rating, Review and Tags. Release date, developers/publishers, prose and screenshots follow. The order stays stable while typing. Returning from the form preserves its state; selecting/continuing from a preview again opens comparison before overwriting anything. Search query/results/scroll survive Back from the preview.

**Platforms:** Available provider platforms are selectable chips, initially unselected. Existing selections remain even if absent from refreshed provider options. Without provider options, manual platform entry and library suggestions remain available. Selected platforms continue to drive library display/filtering.

**Edit:** Update metadata above the game information fetches the saved IGDB ID directly. Unlinked legacy/manual games search by draft title and require explicit result selection. Find another game opens the shared search screen. No title-only automatic matching/linking occurs. Titles can be edited without changing identity. Metadata and identity remain draft-only until Save.

**Comparison:** Read-only Field/Before/After table. Before uses current draft values. After shows the available proposal even on excluded rows. Changed text uses red deletion/green insertion marks, added tags are highlighted, and changed images have colored borders. Excluded rows dim. Cancel opens the shared unsaved-change confirmation when a draft or pending proposal differs. The orange split button applies its selected mode; changing the menu only changes the selection/diff presentation.

- Update if empty is the default on every new update session. It fills only empty strings, empty arrays or a placeholder cover.
- Replace current data replaces supplied differing metadata, including uploaded covers and screenshot/company lists. Tags use a case-insensitive union retaining existing spelling/order.
- Select manually reveals field checkboxes. First entry copies the preceding mode's eligible selection. Choices survive mode switches in that comparison and reset when another game is selected. Unavailable/identical fields cannot be checked.
- Missing/empty provider values never clear current fields. A Tags union above 30 blocks application until Tags is deselected or existing tags are reduced; no silent truncation.
- Applying also confirms the chosen IGDB identity and refreshes available platform options. Identity-only linking is permitted. Discard confirms neither. Selected platforms and personal fields stay unchanged.

Summary/storyline remain editable independently of Review. Screenshots support expansion, removal and reordering, not manual image uploads. Details show companies, summary, collapsible storyline and the gallery. No filled-source badges, changed-field counters, instructional banners, timed Undo or persisted IGDB field preferences remain. Cancel, outside click, Escape and Close dismiss unchanged forms immediately. Changed drafts show Save and close, Discard and Keep editing. Confirmed comparison saves use the current mode. Nested viewers and selection menus close independently. Invalid input keeps the form open. Back preserves creation input; edit Back uses the same unsaved-change confirmation. Successful creation and editing return to the library. Failed saves retain values/uploads for retry.

The additive SQLite migration adds a nullable unique IGDB ID without deleting existing data. Legacy JSON fields default to empty in the form; legacy identity remains unlinked. Title and IGDB identity conflicts are reported separately.

## Phase 9 Steam import (implemented)

Import Steam accepts a Steam ID64 or HTTPS Steam Community profile URL, including vanity URLs. One server-side `STEAM_WEB_API_KEY` is shared by the application. Fetches include app information and played free games. Missing game details report unavailable access; an explicit zero game count has an empty state. This feature reads the API-visible library, not purchase history or wishlists. The resolved ID64 is stored in local storage after a successful owned-games fetch, independently of game import. The next opening loads that account automatically; Change account and Forget account allow replacement/removal. Failed fetches preserve the previous saved ID. If storage is unavailable, manual account input remains usable; multi-account aggregation and automatic sync are out of scope.

The workflow is account input (only when needed), full-library metadata loading, then one combined selection/review list and Import. Rows are shown only after enrichment and identity matching finish, or after explicitly continuing without missing metadata. New games start selected; existing games start unselected. Search and All/New/Existing filters support selecting the filtered set; lists display 50 rows per page. New records default to platform `Steam` and status `Unplayed`. Existing platforms are preserved; adding Steam is a selectable union proposal. Rating and review are never overwritten. Each row has a Status selector, initially Unplayed for new games or the saved status for existing games. Changing it selects that row and stages the value until Import; deselected rows are not saved. Status edits survive metadata-mode changes. No status is inferred from playtime. A required new title falls back to the Steam title if its metadata proposal is deselected.

IGDB enrichment runs for all returned games in batches, matching Steam App IDs through external IDs rather than fuzzy title matches. It supplies all supported metadata, including companies, prose, screenshots and available platform options. Missing or ambiguous matches offer manual search or Steam-only import. Initial selection is calculated only after enrichment, so IGDB-discovered existing records are unselected from the first visible list. Title-only candidates are labelled for explicit linking; conflicting identifiers cannot import until another valid match is chosen or the row is skipped. One library game supports one Steam App ID and one IGDB ID; edition collisions are not merged automatically.

The orange Import split button offers Update if empty, Replace current data and Customize per game. Empty is the initial default. The first two modes control every row and hide individual mode/field controls. Customize per game alone enables row-level Update if empty, Replace current data and Select manually; field checkboxes appear only for a row in manual mode. On first entry, rows inherit the preceding global mode. Switching back to a global mode temporarily ignores but preserves row overrides for that preview. The read-only Field/Before/After table uses the IGDB diff styling. Missing provider values never clear fields, Tags always union and Replace can replace uploaded covers. Identity and available platform options are linked with a confirmed import independently of metadata field choices.

Steam supplies total playtime in minutes. An existing total is never automatically replaced, even in Replace mode or with remembered playtime preferences. Select it explicitly in manual mode or use Update playtime, which selects changed Steam-linked records and only their playtime field by switching to Customize per game. Already fetched metadata remains available for review. Totals replace rather than add to existing time. An unavailable total is not treated as zero. Repeated imports discover new games and updates without deleting library games absent from Steam's response.

Local storage remembers the account ID and global mode only. Default fields has been removed. Per-game modes, field choices, Status drafts, credentials and previews are not persisted. Invalid/unavailable storage falls back to empty mode and account entry. Remembered settings persist independently of whether games are imported; individual overrides remain temporary.

Cancel, outside click, Escape and Close prompt Review import / Discard / Keep editing when input or selection settings have changed. Review import returns to review, never commits. Saving blocks dismissal. Each game saves independently; successful rows leave the selection and failures retain choices for retry. A durable receipt makes retries safe after a lost response, and stale existing-game previews require reloading. All-success returns to the library; partial success stays in the import dialog. Reload library refreshes current records and resets temporary row overrides for a new review.

## Provider credentials

IGDB and Steam credentials remain server-only. Production defaults to AWS Secrets Manager in `us-east-1`, using `infs3701/game-library/igdb` and `infs3701/game-library/steam` through the EC2 role. Successful reads are cached in process memory for five minutes and refreshed on demand. Failed or invalid reads return a safe service-unavailable response; manual game entry remains available.

Local development retains `.env`/`.env.local` support. Set `SECRETS_SOURCE=env` for local production-build testing; set `SECRETS_SOURCE=aws` for EC2. AWS mode never falls back to environment credentials. No credential values are sent to the browser or persisted with games. See [Architecture](ARCHITECTURE.md#server-credentials) for configuration details.

## Out of scope

Authentication, multiple users, social features, recommendations, scheduled store/account sync and dedicated game pages. Phase 9 adds manual Steam import only; RAWG integration is not planned.
