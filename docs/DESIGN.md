# Design

## Visual system

Dark-only, cover-focused library with Jersey 10 headings/wordmark, Manrope functional text and Lucide icons. Styles are in `src/app/globals.css`; font imports are in `src/app/layout.tsx`.

| Tokens                                | Values                                        |
| ------------------------------------- | --------------------------------------------- |
| Background / surface / raised / hover | `#0f1113` / `#171a1d` / `#1e2226` / `#252a2f` |
| Text / muted / faint                  | `#f3f4f5` / `#a6adb4` / `#737b84`             |
| Border                                | `#2c3238`                                     |
| Accent / hover / foreground           | `#ff5e24` / `#ff7040` / `#ffffff`             |
| Danger                                | `#e45a5a`                                     |

Orange marks primary actions, focus and active drop targets; red marks errors/deletion. Status/tag chips are neutral and labelled. Controls, cards and dialogs use rounded corners and subtle surfaces/borders. Buttons have 150ms color transitions, disabled for reduced motion.

The sticky header contains the wordmark, Library heading, title search and Add Game. View/sort controls and result counts sit above content, with a left filter sidebar. In-memory and restart-loss notices are removed.

## Views and dialogs

- **Grid:** 4:3 covers, compact status selectors, title, platforms and optional rating.
- **List:** aligned rows with thumbnails, title/platforms, inline status selectors and rating; tags, playtime and release date appear when space allows.
- **Kanban:** five status columns, filtered counts, cover cards, playtime/rating and status selectors. Dragged cards fade; the drop column gains an orange border.
- **Details:** title and a large 3:4 cover, prominent status selector and rating, then platforms/tags and secondary playtime/release date. Empty review and unset metadata are muted. Only the body scrolls; Delete/Close/Edit remain fixed in the footer. Review precedes company information, summary, storyline and screenshots.
- **Add/Edit:** Search, preview and form share one dialog. A large cover and Title lead the form, followed by Status, Platforms, Playtime, Rating, Review and Tags. Release date, plain-text company inputs, prose and screenshots follow below. Mobile uses one column. Cancel and Add game/Save changes stay visible in a sticky footer.
- **Delete:** confirmation offers Keep game or Delete game.

Provider-backed Platforms use toggle chips for all returned options and existing selections. Without provider options, removable chips and up to eight library suggestions allow custom entry. Tags suggest matching existing values in a floating, scrollable list while typing; suggestions do not shift the form and reposition to fit the viewport. Both support Up/Down navigation, Enter to select and Escape to close suggestions without dismissing the dialog. Custom values commit with comma, Enter, Tab or blur; labels deduplicate case-insensitively.

The cover field is a clickable preview with no adjacent text or actions. Click the preview or drop an image to upload/replace it. There are no URL-entry or cover-removal controls. Existing covers are preserved on unrelated edits; an explicitly approved IGDB cover can replace them. Invalid uploads show an inline error and preserve the prior selection. Covers are sent only when saving the game; Cancel opens the unsaved-change confirmation when changes exist. Only Discard abandons the draft; failed saves retain the selected file for retry. Storage modes and upload limits are defined in [SPEC](SPEC.md).

## Responsive behavior

Grid has four columns, three at 1000px or below, and two at 760px or below. At 760px, filters move above content into a collapsible panel; view/sort controls span the width. Rating is the first filter, selecting a minimum from 1–10 or Any. Active filters are removable chips, and search has a clear control.

List hides tags/release date at 1200px and playtime at 1000px. At 760px, headings disappear and status/rating stack beside the title. Kanban keeps five columns of at least 240px and scrolls horizontally.

Dialogs are centered and constrained to the viewport. Main form/detail dialogs are at most 760px wide; screenshot viewers are at most 1200px and save confirmations at most 440px. Form/detail cover and title sections stack at 600px or below; form pairs and metadata fields stack at 560px or below. The editable cover retains its 3:4 ratio. At 360px or below, confirmation actions stack in the order Save and close, Discard, Keep editing.

## Accessibility and feedback

Visible focus, labelled controls, title-based image alt text, Radix modal focus containment/restoration and keyboard-operable Select/rating controls are implemented. Grid, List, Kanban and Details offer keyboard/touch status selectors. Status updates are immediate, revert on failure and disable further changes while saving. Escape and outside-click dismissal are blocked while saving/deleting.

Loading, empty, no-match, saving/deleting and error states are present. Library errors offer reload; no-match states offer filter reset. Errors use alerts; local form errors receive focus and scroll into view. Success notifications float above dialogs at the viewport bottom for five seconds, with a screen-reader status region and no layout shift. Broken covers use the bundled placeholder.

## Phase 9 IGDB interaction (implemented)

Add starts with a title search, Search button and subdued Add manually action. A nonblank query debounces for 150 ms. Results occupy a scrollable list with cover, title, year and platform names. Keyboard Up/Down and Enter select a result; composition suppresses searches. Explicit Search bypasses the debounce. Selection opens a preview with company names, summary, collapsible storyline and expandable screenshots. Continue opens the editable form; Back preserves query/results and the form draft.

Personal library fields precede imported metadata. All text is editable; company inputs are comma-separated text and Tags use tokens. Platform chips represent provider options and preserve manual selections. Screenshots can be removed, reordered and enlarged. Details display the added metadata without increasing card/list density. The form has no source badges, changed counts, timed notices or persistent field-preference controls.

Update metadata sits above the game information. Linked games fetch details directly; unlinked games search explicitly. Find another game is a subdued action under the selected identity. Comparison is a three-column Field/Before/After table with a smaller Cancel button and orange split action. Missing/identical and otherwise excluded rows dim. Red deletions/green additions identify changed text, with image borders and tag insertion markers. After retains the proposal even when excluded so manual selection is informed.

The split menu offers Update if empty (initial), Replace current data and Select manually. Only manual mode shows checkboxes. It inherits the preceding mode on first entry and preserves choices across mode switches until the selected game/session changes. Apply selected is its action label. Table values are never editable. Long text wraps; mobile rows become paired Before/After cells below a field label. Menu, checkboxes, platform toggles and gallery controls support keyboards. Footer actions remain visible. Errors are short and actionable; no routine explanatory banners are shown.

The initial search has Cancel; subsequent steps have Back. Cancel, outside click, Escape and Close dismiss unchanged forms immediately. Changed drafts show Save and close, Discard and Keep editing. From this confirmation, Save and close applies the current comparison mode and saves. Keep editing or Escape restores the draft; outside clicks leave the confirmation open. Invalid input or failed saves keep the form open. Nested menus, suggestions and screenshot viewers dismiss independently. A failed fetch permits retry, manual matching or manual entry. Successful creation and editing return to the library. Search input receives focus on entry. Search dialogs fit the reserved results area and retain their height across empty, loading and results states. The image viewer reserves its image area before loading and places navigation and Close in a separate toolbar.

Search feedback stays inside the results region, sized to the smaller of 380px or 46% of viewport height: a spinner and result-shaped skeletons during loading, and centered retry/empty states. The save confirmation uses a compact heading, target game name, paired Discard/Save and close actions and a separate Keep editing action with initial focus.

## Phase 9 Steam interaction (implemented)

Import Steam is a secondary action beside Add Game. With no saved account, its profile URL/ID64 input receives focus. A successful library fetch remembers the resolved account ID in local storage; future openings load it directly. Change account returns to input and Forget account removes the saved ID. Failed loads offer Retry without erasing the saved account.

Owned-games retrieval, full-library IGDB enrichment and identity matching precede a single selection/review list. A viewport-bounded dialog up to 940px wide reserves its list area during loading, using skeletons and progress. Incomplete metadata offers retry or explicit continuation with missing values. No preliminary selection screen or Continue step remains.

Rows show selection, cover, title, New/Existing/link/conflict state, playtime and a Status selector. Changing Status selects the row but writes nothing until Import. New games start selected and Unplayed; existing games start unselected with their saved status. Search, All/New/Existing, Select filtered games, Update playtime and 50-row pagination remain available on the same screen. Mobile wraps Status below the title.

Expanding a row shows the shared Field/Before/After table and manual IGDB matching. The global Import split menu offers Update if empty, Replace current data and Customize per game. Individual update controls are hidden in the first two modes. Customize per game exposes each row's three IGDB update modes, with field checkboxes only in Select manually. First entry inherits the preceding global mode; returning to global mode preserves temporary per-game settings for restoration. Only the global mode is remembered across sessions; Default fields is removed. Status edits are independent of these metadata controls.

The fixed footer pairs Cancel with Import N games. Saving displays progress and blocks dismissal. Partial failure shows per-row errors, Retry and Reload library. Dismissal uses Review import / Discard / Keep editing; Review import returns to the retained list without saving. Nested viewers and select menus dismiss independently.
