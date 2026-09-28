# DESIGN.md

## Direction

A simple dark game-library UI influenced by the supplied Obscura style reference.

Use Obscura for typography, accent discipline, shape language, and restrained pixel character. Do not copy its marketing-page layout, cloud composition, hero structure, or light theme.

The game covers are the main visual content.

## Theme

Dark only.

The interface should feel compact, calm, and game-oriented rather than like a marketing site.

## Typography

### Jersey 10

Use for display text only:

- App wordmark
- Page title
- Major dialog title
- Large empty-state heading

Do not use it for body text, form labels, buttons, tags, filters, table/list rows, or other dense UI.

Suggested sizes:

- 36px
- 48px
- 60px

### Manrope

Use for all functional UI and body copy.

Suggested sizes:

- 12px captions
- 14px compact UI
- 16px body and controls
- 18px subheadings

Weights:

- 400 regular
- 500 controls
- 600-700 emphasis

## Colors

Use a near-black neutral system with one chromatic accent.

```css
--bg: #0f1113;
--surface: #171a1d;
--surface-raised: #1e2226;
--surface-hover: #252a2f;

--text: #f3f4f5;
--text-muted: #a6adb4;
--text-faint: #737b84;

--border: #2c3238;

--accent: #ff5e24;
--accent-hover: #ff7040;
--accent-foreground: #ffffff;

--danger: #e45a5a;
```

Signal Orange `#ff5e24` is the only brand accent.

Do not introduce a competing blue, purple, or green brand color. Semantic status colors may be used sparingly where needed, but status should primarily be communicated by labels and structure.

## Surfaces

Page:

- `--bg`

Primary cards and panels:

- `--surface`

Floating dialogs and selected/raised items:

- `--surface-raised`

Hover state:

- `--surface-hover`

Use subtle 1px borders. Avoid large glows and heavy shadows.

## Shape language

Controls:

- 6px radius

Cards:

- 12px radius

Large dialogs:

- 16px radius

Cover images:

- 8-12px radius

Avoid full pill buttons except for small tags/status chips where the shape is useful.

## Primary action

Use orange for one main action in a local context, such as:

- Add Game
- Save
- Confirm creation

Primary button:

- Orange background
- White Manrope text
- 6px radius
- No gradient

Secondary actions use neutral dark surfaces or ghost styling.

Destructive actions use the danger color, not orange.

## App shell

Desktop:

```text
+------------------------------------------------------+
| Library                     Search      + Add Game   |
|------------------------------------------------------|
| View switch | Filters | Sort                         |
|------------------------------------------------------|
|                                                      |
|                    active library view               |
|                                                      |
+------------------------------------------------------+
```

Do not reproduce the Obscura marketing navigation, hero, footer, or section structure.

## Library Grid

Game covers dominate.

Each card contains:

- Cover
- Title
- Platforms
- Optional rating
- Status

Keep metadata brief. Full metadata belongs in the detail dialog.

Cards should have restrained borders and minimal elevation.

## Library List

Use compact horizontal rows.

Suggested columns/content:

- Cover thumbnail
- Title
- Platforms
- Tags
- Status
- Rating
- Playtime
- Release date

Collapse lower-priority metadata on narrow screens.

## Kanban

Five horizontally arranged columns:

- Unplayed
- Playing
- Completed
- Backlog
- Dropped

Each column has:

- Status heading
- Item count
- Vertical stack of compact game cards

Kanban cards should show only the information needed to identify the game.

Dragging should provide a clear neutral hover/drop target. Orange may be used for the active drop indicator.

## Game detail dialog

Centered floating card on desktop.

Recommended structure:

```text
+------------------------------------------------+
| Cover        Title                             |
|              platforms                         |
|              tags                              |
|              status / rating / release date   |
|                                                |
|              playtime                          |
|              review                            |
|                                                |
|                     Edit   Close               |
+------------------------------------------------+
```

On small screens, the dialog may become near-full-screen.

## Add/Edit dialog

Use a clear form with grouped fields.

Suggested order:

1. Title
2. Platforms
3. Tags
4. Status
5. Release date
6. Playtime
7. Rating
8. Review
9. Cover source

If RAWG autofill is implemented, place metadata search near the title field. Imported values must remain editable.

## Tags and statuses

Use small Manrope chips.

Tags:

- Neutral dark fill
- Subtle border
- Muted text

Status:

- Slightly stronger visual weight than tags
- Do not assign five loud unrelated colors unless later testing shows it is necessary

## Pixel-art influence

Keep it restrained.

Allowed:

- Tiny pixel-style app mark
- Small empty-state sprite
- Minor decorative icon near the page title

Avoid:

- Floating cloud fields
- Large decorative pixel scenes
- Pixel art behind content
- Repeating decorative sprites on every card

## Motion

Use short, functional transitions only:

- Hover
- Dialog open/close
- View switch
- Kanban drag/drop

Avoid elaborate page transitions.

## Responsive behavior

Desktop first.

Grid:

- Multi-column desktop
- Fewer columns as width decreases
- Single or two-column mobile depending on width

List:

- Hide or condense secondary metadata on small screens

Kanban:

- Preserve columns
- Horizontal scrolling on narrow screens

Dialogs:

- Centered card on desktop
- Near-full-screen on mobile

## Accessibility

- Maintain readable contrast on dark surfaces.
- Show visible keyboard focus.
- Do not rely on color alone for status.
- Buttons and drag targets need clear hover/focus states.
- Images require useful alt text when a title is known.
