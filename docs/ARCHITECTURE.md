# ARCHITECTURE.md

## Stack

- Next.js
- React
- Tailwind CSS
- shadcn/ui
- AWS EC2

The app runs as a single Next.js service on one EC2 instance for the assignment.

## Deployment stages

### Stage 1: initial deploy

```text
Browser
  |
HTTP
  |
EC2
  |
Next.js app
  |
In-memory game repository
```

The first version keeps game data in memory. This is intentionally temporary so UI, CRUD, routing, and EC2 deployment can be completed before storage is added.

Data resets when the process restarts.

### Stage 2: final storage architecture

```text
Browser
  |
HTTP
  |
EC2
  |
Next.js app
  | \
  |  \ uploaded covers
  |   -> Amazon S3
  |
  -> SQLite database on EBS
```

Final responsibilities:

- EC2 runs the application and server-side CRUD logic.
- SQLite stores game metadata.
- The SQLite database file lives on EBS-backed EC2 storage.
- S3 stores user-uploaded cover images.
- Remote cover URLs remain remote and are stored only as URLs.

## Application structure

Use a small repository boundary so storage can change without rewriting the UI.

```text
UI components
    |
Route handlers / server logic
    |
GameRepository
    |
    +-- InMemoryGameRepository   // Stage 1
    |
    +-- SqliteGameRepository     // Stage 2
```

Suggested repository operations:

```ts
listGames()
getGame(id)
createGame(input)
updateGame(id, input)
deleteGame(id)
```

The initial implementation should only implement the in-memory repository, while keeping the interface compatible with the later SQLite repository.

## Suggested server endpoints

```text
GET    /api/games
POST   /api/games
GET    /api/games/:id
PATCH  /api/games/:id
DELETE /api/games/:id
```

A later S3 upload endpoint can be added when storage work begins.

## Client state

Server data is the source of truth.

Local client state is limited to:

- Current view mode
- Search query
- Active filters
- Sort option
- Open dialog
- Form draft
- Drag state

Kanban drag-and-drop updates status through the normal game update path.

## Cover model

Store the cover source type together with the URL where applicable.

```text
upload       -> S3 object URL
url          -> external URL
api          -> external API image URL
placeholder  -> local bundled asset
```

## Optional RAWG integration

If added, RAWG requests should be made server-side rather than exposing an API key in browser code.

RAWG must remain optional and isolated from core CRUD. Failure of the external API must not prevent manual game creation or editing.

## AWS scope

Initial deployment:

- One small EC2 instance
- Public HTTP access
- No domain
- No HTTPS requirement
- No authentication

Final storage:

- EBS-backed SQLite
- S3 bucket for uploaded covers

## Assignment extensions

The architecture must leave room for three justified "Going Beyond" topics from Weeks 1-4.

Do not lock these in yet. Select them after the relevant course material is available, then document why each one solves a real problem in this service.
