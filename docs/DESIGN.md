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

- **Grid:** 4:3 covers, status overlays, title, platforms and optional rating.
- **List:** aligned rows with thumbnails, title/platforms, status and rating; tags, playtime and release date appear when space allows.
- **Kanban:** five status columns, filtered counts, cover cards, playtime/rating and status selectors. Dragged cards fade; the drop column gains an orange border.
- **Details:** title, 4:3 cover, grouped metadata, ten rating stars, review and Delete/Close/Edit actions.
- **Add/Edit:** cover beside title/status, then paired platforms/tags and release date/playtime, followed by rating and review. Playtime uses compact `[0] h [0] m` inputs. Dialogs show only the heading, with no introductory description. Fields scroll while Cancel/Create/Save remain visible.
- **Delete:** confirmation offers Keep game or Delete game.

Tokens commit with comma, Enter, Tab or blur and deduplicate case-insensitively. The cover field is a clickable preview with no adjacent text or actions. Click the preview or drop an image to upload/replace it. Image URL entry is removed. Existing covers are preserved on unrelated edits. Invalid uploads show an inline error and preserve the prior selection. Covers are sent only when saving the game; cancelling discards changes and failed saves retain the selected file for retry. Storage modes and upload limits are defined in [SPEC](SPEC.md).

## Responsive behavior

Grid has four columns, three at 1000px or below, and two at 760px or below. At 760px, filters move above content into a collapsible panel; view/sort controls span the width. Rating is the first filter, selecting a minimum from 1–10 or Any. Active filters are removable chips, and search has a clear control.

List hides tags/release date at 1200px and playtime at 1000px. At 760px, headings disappear and status/rating stack beside the title. Kanban keeps five columns of at least 240px and scrolls horizontally.

Dialogs are centered, at most 760px wide, with 8px mobile margins. Detail content and form pairs stack at 560px or below; the cover field uses a smaller preview; form footer buttons share the available width.

## Accessibility and feedback

Visible focus, labelled controls, title-based image alt text, Radix modal focus containment/restoration and keyboard-operable Select/rating controls are implemented. Status selectors provide a keyboard/touch alternative to dragging. Escape and outside-click dismissal are blocked while saving/deleting.

Loading, empty, no-match, saving/deleting and error states are present. Library errors offer reload; no-match states offer filter reset. Errors use alerts, successful mutations use a screen-reader status region, and local form errors receive focus and scroll into view. Broken covers use the bundled placeholder.

Phase 8's UI is implemented; cloud validation remains pending. RAWG search/preview is optional future work and must preserve editable values and manual entry.
