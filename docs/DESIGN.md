# Design

## Implemented visual system

Dark-only, cover-focused library influenced by the Obscura reference's typography and restrained pixel character. The current shell has a sticky header containing the wordmark, Library heading, title search and Add Game action. It stays above scrolling content and below modal dialogs, with compact spacing on mobile. The shell also has an in-memory indicator, view/sort toolbar, left filter sidebar and results count with a server-restart notice.

Styles live in `src/app/globals.css`; local font imports are in `src/app/layout.tsx`.

- Jersey 10 is used for the wordmark (27px desktop, 22px mobile), page heading (48px desktop, 36px mobile), dialog headings (40px desktop, 36px mobile) and empty-state headings (36px).
- Manrope supplies functional text at 10–15px, with a 14px body and form controls. Weights 400, 500, 600 and 700 are bundled.
- Lucide icons accompany controls. The bundled cover placeholder contains a pixel-style gamepad; it repeats wherever covers are absent or broken.

| Token                         | Value                 |
| ----------------------------- | --------------------- |
| `--bg`                        | `#0f1113`             |
| `--surface`                   | `#171a1d`             |
| `--surface-raised`            | `#1e2226`             |
| `--surface-hover`             | `#252a2f`             |
| `--text`                      | `#f3f4f5`             |
| `--text-muted`                | `#a6adb4`             |
| `--text-faint`                | `#737b84`             |
| `--border`                    | `#2c3238`             |
| `--accent` / `--accent-hover` | `#ff5e24` / `#ff7040` |
| `--accent-foreground`         | `#ffffff`             |
| `--danger`                    | `#e45a5a`             |

Orange marks primary actions, focus outlines and active drop borders. Delete actions and errors use red. Status/tag chips are neutral and text-labelled. Controls have 6px corners, grid cards/board columns 12px, list rows/board cards 8px and dialogs 16px. Borders are subtle and 1px wide. Shell sections are separated by spacing instead of divider rules; the sticky header uses a soft shadow. On mobile, filters use a subtle surface panel, and view/sort controls span the content width.

## Implemented views and dialogs

- **Grid:** 4:3 covers with status overlays; title, platforms and optional rating beneath.
- **List:** a shared surface with borderless rows, aligned column headings, larger 4:3 thumbnails, subdued tag/status chips and starred ratings. On mobile, status and rating stack beside the title and platform; column headings are hidden. Playtime and release date appear when screen width allows.
- **Kanban:** five columns, each at least 240px wide, with filtered counts. Cards contain a full-width 4:3 cover, title, platforms, playtime with a clock icon, optional rating and a status selector. Tonal surfaces separate cards and columns without extra divider lines. Dragged cards fade; the active column gains an orange border.
- **Details:** title above a 4:3 cover and grouped metadata panel with ten filled/empty rating stars and a numeric value, a full-width review section, followed by Delete, Close and Edit actions. The layout stacks at 560px or below.
- **Add/Edit:** 4:3 cover preview with an overlaid Edit cover action above the title, platform/tag token inputs, status, release date, hours/minutes, rating and review. Tokens commit with comma, Enter, Tab or blur and can be removed individually. Edit cover reveals direct Placeholder/Image URL controls and focuses the URL input when selected. Uploads remain unavailable. Rating uses ten clickable stars, keyboard-operable radio controls and Clear rating. The form fields scroll independently while Cancel and Create/Save stay visible in a fixed footer.
- **Delete:** confirmation replaces the dialog contents and offers Keep game or Delete game.

## Implemented responsive behavior

- Grid uses four columns on desktop, three at 1000px or below, and two at 760px or below.
- Status, platform, tag and rating filters use direct clickable controls in a left sidebar. The rating slider sits first in the sidebar, with tick marks at every step. It selects a minimum rating from 1–10 (inclusive), with its leftmost position clearing the filter (Any). At 760px or below, filters sit above the views in a collapsible panel.
- List hides tags/release date at 1200px or below and playtime at 1000px or below; rating remains visible on mobile.
- Kanban preserves five columns and scrolls horizontally.
- Dialogs are centered, at most 760px wide and vertically scrollable. At mobile widths they leave 8px viewport margins. Form pairs and detail content stack at 380px or below.

## Implemented accessibility and feedback

All dropdowns share a dark Radix Select menu with selected-item checkmarks, disabled options, keyboard navigation and typeahead. Visible keyboard focus, labelled controls, title-based image alt text, Radix modal focus containment and focus restoration are present. Escape/outside-click dismissal is blocked while a mutation is pending. Kanban selectors provide a keyboard/touch alternative to dragging. Errors use alerts; successful mutations use a screen-reader status region.

Loading, empty-library, no-match, empty-column and saving/deleting states are implemented. Button background/border transitions last 150ms and are disabled for reduced motion. There are no custom dialog or view-transition animations.

## Planned UI work

Enable uploads when S3 support exists. If RAWG is added, introduce metadata search/preview with editable imported fields. Neither flow is implemented. Preserve the current dark theme, neutral statuses and manual-entry workflow when extending the UI.
