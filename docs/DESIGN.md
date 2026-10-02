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

The cover field is a clickable preview with no adjacent text or actions. Click the preview or drop an image to upload/replace it. There are no URL-entry or cover-removal controls. Existing covers are preserved on unrelated edits. Invalid uploads show an inline error and preserve the prior selection. Covers are sent only when saving the game; cancelling discards changes and failed saves retain the selected file for retry. Storage modes and upload limits are defined in [SPEC](SPEC.md).

## Responsive behavior

Grid has four columns, three at 1000px or below, and two at 760px or below. At 760px, filters move above content into a collapsible panel; view/sort controls span the width. Rating is the first filter, selecting a minimum from 1–10 or Any. Active filters are removable chips, and search has a clear control.

List hides tags/release date at 1200px and playtime at 1000px. At 760px, headings disappear and status/rating stack beside the title. Kanban keeps five columns of at least 240px and scrolls horizontally.

Dialogs are centered, at most 760px wide, with 8px mobile margins. At 560px or below, detail content and form pairs stack, and footer buttons share the available width. The cover remains beside title/status with a 16px gap, retaining its 4:3 ratio and input alignment.

## Accessibility and feedback

Visible focus, labelled controls, title-based image alt text, Radix modal focus containment/restoration and keyboard-operable Select/rating controls are implemented. Grid, List, Kanban and Details offer keyboard/touch status selectors. Status updates are immediate, revert on failure and disable further changes while saving. Escape and outside-click dismissal are blocked while saving/deleting.

Loading, empty, no-match, saving/deleting and error states are present. Library errors offer reload; no-match states offer filter reset. Errors use alerts; local form errors receive focus and scroll into view. Success notifications float above dialogs at the viewport bottom for five seconds, with a screen-reader status region and no layout shift. Broken covers use the bundled placeholder.

RAWG search/preview is optional future work and must preserve editable values and manual entry.
