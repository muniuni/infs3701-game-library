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
- **Details:** title and 4:3 cover, prominent status selector and rating, then platforms/tags and secondary playtime/release date. Empty review and unset metadata are muted. Delete/Close/Edit actions remain in the footer.
- **Add/Edit:** a 4:3 cover beside title/status, aligned with the top of the Title input and bottom of Status. Platforms/tags and release date/playtime follow in paired rows, then rating and review. Field groups use 24px gaps. Playtime uses compact `[0] h [0] m` inputs. No introductory description; fields scroll while Cancel/Create/Save remain visible.
- **Delete:** confirmation offers Keep game or Delete game.

Platforms use removable chips and up to eight existing-value suggestions, with typing available for other values. Tags suggest matching existing values in a floating, scrollable list while typing; suggestions do not shift the form and reposition to fit the viewport. Both support Up/Down navigation, Enter to select and Escape to close suggestions without dismissing the dialog. Custom values commit with comma, Enter, Tab or blur; labels deduplicate case-insensitively.

The cover field is a clickable preview with no adjacent text or actions. Click the preview or drop an image to upload/replace it. There are no URL-entry or cover-removal controls. Existing covers are preserved on unrelated edits; an explicitly approved IGDB cover can replace them. Invalid uploads show an inline error and preserve the prior selection. Covers are sent only when saving the game; cancelling discards changes and failed saves retain the selected file for retry. Storage modes and upload limits are defined in [SPEC](SPEC.md).

## Responsive behavior

Grid has four columns, three at 1000px or below, and two at 760px or below. At 760px, filters move above content into a collapsible panel; view/sort controls span the width. Rating is the first filter, selecting a minimum from 1–10 or Any. Active filters are removable chips, and search has a clear control.

List hides tags/release date at 1200px and playtime at 1000px. At 760px, headings disappear and status/rating stack beside the title. Kanban keeps five columns of at least 240px and scrolls horizontally.

Dialogs are centered, at most 760px wide, with 8px mobile margins. At 560px or below, detail content and form pairs stack, and footer buttons share the available width. The cover remains beside title/status with a 16px gap, retaining its 4:3 ratio and input alignment.

## Accessibility and feedback

Visible focus, labelled controls, title-based image alt text, Radix modal focus containment/restoration and keyboard-operable Select/rating controls are implemented. Grid, List, Kanban and Details offer keyboard/touch status selectors. Status updates are immediate, revert on failure and disable further changes while saving. Escape and outside-click dismissal are blocked while saving/deleting.

Loading, empty, no-match, saving/deleting and error states are present. Library errors offer reload; no-match states offer filter reset. Errors use alerts; local form errors receive focus and scroll into view. Success notifications float above dialogs at the viewport bottom for five seconds, with a screen-reader status region and no layout shift. Broken covers use the bundled placeholder.

## Phase 9 IGDB interaction (implemented)

**Add Game:** Title is the primary search control. Typing three or more characters opens a floating autocomplete below it after a 300 ms debounce. Compact rows show cover, title and release year. Up/Down changes the active option; Enter selects it; Escape dismisses suggestions without closing the dialog; Tab continues through the form. Mouse selection retains input focus. IME composition does not trigger searches or selection. Typing cancels stale requests, and selecting a result does not trigger another search for the autofilled title. Suggestions allow wheel/trackpad scrolling; there is no result-count message or Search manually button. Loading/no-match and unavailable-provider feedback do not shift form layout or block manual entry.

Result selection immediately fills enabled fields in the draft. It replaces title/release date, merges genres into personal Tags and preserves a selected upload. Autofill fields exposes four remembered checkboxes through a compact disclosure without leaving Add. No persistent provider/source badge is shown.

A floating “Autofilled X fields · Undo” notice appears above the dialog footer after changed fields are applied. It does not move form content or focus. The status text is announced, Undo is keyboard operable, and the ten-second timer pauses on hover/focus. Latest application replaces the prior snapshot; expiry, saving or closing clears it. Undo restores the changed fields before that application, preserving unrelated form edits.

**Edit Game:** Title remains a normal manual input. A small Autofill action beside the Title label opens search/results in the same dialog and immediately searches the draft title. Editing that search query triggers a debounced search without a Search button. Outside clicks, Escape and the close control return to the edit form; Back also preserves the draft. Result selection shows only available differing fields, with current/proposed text, full Tag lists and cover thumbnails. Available changes start checked. Applying genres appends new values to existing Tags with case-insensitive deduplication; the comparison shows the merged result. No changes available has its own state. Apply selected returns to the draft and Save is the only commit.

Use existing dark surfaces, focus styles and responsive sizing. Autocomplete stays anchored and fits the available viewport, scrolls results and preserves modal focus containment. Comparison values stack on narrow screens; dialog footer actions stay visible. Provider errors permit manual entry and retry. Browser storage failure falls back to defaults. No result, draft or provider identity is persisted. Detailed behavior is in [SPEC](SPEC.md).

## Phase 9 Steam interaction (planned, not implemented)

Add **Import Steam** beside Add Game. The dialog first accepts a Steam ID/profile URL, then displays a scrollable selectable list after fetching/enrichment. Show matched, unmatched, existing and conflict states, plus selected counts. New games initially start selected; existing games start unselected. Expand a row to inspect field checkboxes and current/proposed values. Unresolved rows offer **Find IGDB match**, using the same search/confirmation pattern, or may proceed with Steam data alone. Conflicting record matches block that row until explicitly resolved or skipped.

Above the Steam list, provide **Default fields** checkboxes to control and remember field preferences for future previews; changes also initialize eligible fields in the current preview. Each row retains its own overrides for that preview only. IGDB retains its own field preferences. Keep the two preference sets separate. Missing fields initially default checked. Existing-value replacements start unchecked; differing existing Steam playtime always starts unchecked even after changing defaults. Explain beside playtime that applying it replaces the current total and may discard non-Steam time. New Steam rows show `PC` and `Unplayed` as defaults, not inferred IGDB fields.

The final **Import selected** button shows the game count. Disable it while saving or when selected rows have unresolved conflicts/invalid required titles. Save bounded batches with progress, then show created, updated/linked and failed counts plus per-row errors. Retain failed rows and their choices for retry; completed rows are no longer selected. During writes block dismissal as in existing save dialogs; closing a fetch/preview writes nothing. After completion refresh the library from server data.

Use existing dark surfaces, controls and dialog sizing. On narrow screens stack current/proposed values and wrap account/actions without horizontal overflow. Keep footer actions visible, checkboxes/row expansion keyboard operable, loading/progress announced and focus restored between steps. Include no-results, inaccessible Steam game details, confirmed empty library, missing configuration, provider failure and retry states. IGDB failure offers retry or continuing with Steam-only data. Field/default behavior is specified in [SPEC](SPEC.md).
