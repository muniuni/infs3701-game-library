# SPEC.md

## Product

A single-user web app for maintaining a personal video game library.

The app must support adding, viewing, editing, and deleting games. It has no login or multi-user features.

## Core game model

```ts
type GameStatus =
  | "Unplayed"
  | "Playing"
  | "Completed"
  | "Backlog"
  | "Dropped";

type Cover =
  | { type: "upload"; url: string }
  | { type: "url"; url: string }
  | { type: "api"; url: string }
  | { type: "placeholder" };

type Game = {
  id: string;
  title: string;
  platforms: string[];
  tags: string[];
  releaseDate?: string;      // ISO date
  status: GameStatus;        // default: Unplayed
  playtimeMinutes?: number;  // stored as total minutes
  rating?: number;           // integer 1-10
  review?: string;
  cover: Cover;
  createdAt: string;
  updatedAt: string;
};
```

Rules:

- A game is unique regardless of platform.
- `platforms` is multi-value.
- `tags` is one multi-value field for genres and user-defined tags.
- Release date, playtime, rating, and review are optional.
- Rating accepts integers from 1 to 10.
- Playtime is stored in minutes and displayed as hours/minutes.
- New games default to `Unplayed`.

## Library views

The Home page supports three switchable views:

### Grid
Cover-focused responsive cards.

### List
Compact rows showing cover, title, platforms, tags, status, rating, playtime, and release date where available.

### Kanban
Five columns, one for each status.

Cards can be dragged between columns. Dropping a card immediately updates its status.

## Game interactions

- Clicking a game opens a centered floating detail card/dialog.
- The detail dialog includes an Edit action.
- Edit mode uses the same dialog rather than navigating to a separate page.
- `Add Game` opens a large creation dialog.
- Delete requires confirmation.

## Search, filter, sort

Search:

- Title only

Filters:

- Status
- Platform
- Tag
- Rating

Sorting:

- Title
- Release date
- Rating
- Playtime
- Recently added
- Recently updated

Search, filters, and sorting apply consistently across Grid, List, and Kanban where practical.

## Cover images

Supported sources:

- User upload
- External URL
- External game API
- Local placeholder

For the final storage version:

- Uploaded files are stored in Amazon S3.
- Manual URLs stay remote.
- API image URLs stay remote.
- Placeholder assets are bundled with the app.

## Metadata autofill

External metadata autofill is optional.

RAWG is the likely provider, but the app must remain fully usable without it. Manual entry is always supported.

If implemented, API metadata may populate fields such as title, platforms, tags, release date, and cover image. The user can edit imported values before saving.

## Responsive behavior

Desktop-first, but usable on phones and tablets.

- Grid reduces column count as width decreases.
- List becomes more compact on narrow screens.
- Kanban scrolls horizontally on narrow screens.
- Dialogs fit within the viewport and become near-full-screen on small devices.

## Out of scope

- Authentication
- Multiple users
- Social features
- Recommendations
- Store integrations
- Cloud sync across accounts
- Dedicated per-game pages
