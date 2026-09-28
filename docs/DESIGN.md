# Design

## Implemented visual system

Dark-only, cover-focused library influenced by the Obscura reference's typography and restrained pixel character. The current shell has a wordmark and in-memory indicator, Library heading, title search, Add Game action, view/filter/sort toolbar and results count with a server-restart notice.

Styles live in `src/app/globals.css`; local font imports are in `src/app/layout.tsx`.

- Jersey 10 is used for the wordmark (27px desktop, 22px mobile), page heading (60px), dialog headings (40px desktop, 36px mobile) and empty-state headings (36px).
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

Orange marks primary actions, focus outlines and active drop borders. Delete actions and errors use red. Status/tag chips are neutral and text-labelled. Controls have 6px corners, grid cards/board columns 12px, list rows/board cards 8px and dialogs 16px. Borders are subtle and 1px wide.

## Implemented views and dialogs

- **Grid:** 3:4 covers with status overlays; title, platforms and optional rating beneath.
- **List:** compact cover/title/platform rows with tags, status, rating, playtime and release date when screen width allows.
- **Kanban:** five columns, each at least 230px wide, with filtered counts. Cards contain a thumbnail, title, platforms and a status selector. Dragged cards fade; the active column gains an orange border.
- **Details:** title above a cover/metadata layout, followed by Delete, Close and Edit actions.
- **Add/Edit:** title, comma-separated platforms/tags, status, release date, hours/minutes, rating, review and cover source. Placeholder and URL are selectable; Upload is disabled.
- **Delete:** confirmation replaces the dialog contents and offers Keep game or Delete game.

## Implemented responsive behavior

- Grid uses adaptive columns, six at widths of at least 1400px and two at widths of 760px or below.
- List hides tags/release date at 1100px or below, then rating/playtime at 760px or below.
- Kanban preserves five columns and scrolls horizontally.
- Dialogs are centered, at most 760px wide and vertically scrollable. At mobile widths they leave 8px viewport margins. Form pairs and detail content stack at 380px or below.

## Implemented accessibility and feedback

Visible keyboard focus, labelled controls, title-based image alt text, Radix modal focus containment and focus restoration are present. Escape/outside-click dismissal is blocked while a mutation is pending. Kanban selectors provide a keyboard/touch alternative to dragging. Errors use alerts; successful mutations use a screen-reader status region.

Loading, empty-library, no-match, empty-column and saving/deleting states are implemented. Button background/border transitions last 150ms and are disabled for reduced motion. There are no custom dialog or view-transition animations.

## Planned UI work

Enable uploads when S3 support exists. If RAWG is added, introduce metadata search/preview with editable imported fields. Neither flow is implemented. Preserve the current dark theme, neutral statuses and manual-entry workflow when extending the UI.
