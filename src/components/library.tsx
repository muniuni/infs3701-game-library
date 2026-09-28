"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Columns3,
  Gamepad2,
  LayoutGrid,
  List,
  Plus,
  Search,
  Star,
} from "lucide-react";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "./ui/dialog";
import { GameCover } from "./game-cover";
import { GameForm } from "./game-form";
import {
  formatPlaytime,
  statuses,
  type CreateGameInput,
  type Game,
  type GameStatus,
} from "@/lib/game";
import { initialFilters, selectGames, type Filters } from "@/lib/library-query";
type Mode = "grid" | "list" | "kanban";
type OpenDialog =
  { mode: "add" } | { mode: "detail" | "edit" | "delete"; id: string } | null;
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || "Request failed. Please try again.");
  }
  return response.status === 204 ? (undefined as T) : response.json();
}
export function Library() {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dialogError, setDialogError] = useState("");
  const [notice, setNotice] = useState("");
  const [view, setView] = useState<Mode>("grid");
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const [busy, setBusy] = useState(false);
  const [dragged, setDragged] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const actionLock = useRef(false);
  const addButton = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  async function load() {
    setLoading(true);
    setError("");
    try {
      setGames(await request<Game[]>("/api/games"));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    let active = true;
    request<Game[]>("/api/games")
      .then((data) => {
        if (active) setGames(data);
      })
      .catch((err) => {
        if (active) setError((err as Error).message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  const visible = useMemo(() => selectGames(games, filters), [games, filters]);
  const selected =
    dialog && "id" in dialog
      ? games.find((game) => game.id === dialog.id)
      : undefined;
  const platforms = [
    ...new Set(games.flatMap((game) => game.platforms)),
  ].sort();
  const tags = [...new Set(games.flatMap((game) => game.tags))].sort();
  function filter(key: keyof Filters, value: string) {
    setFilters((previous) => ({ ...previous, [key]: value }));
  }
  function open(next: OpenDialog) {
    opener.current = document.activeElement as HTMLElement;
    setDialogError("");
    setDialog(next);
  }
  async function save(input: CreateGameInput) {
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    setDialogError("");
    try {
      const game = await request<Game>(
        selected ? `/api/games/${selected.id}` : "/api/games",
        { method: selected ? "PATCH" : "POST", body: JSON.stringify(input) },
      );
      setGames((previous) =>
        selected
          ? previous.map((item) => (item.id === game.id ? game : item))
          : [...previous, game],
      );
      setDialog({ mode: "detail", id: game.id });
      setNotice("Game saved.");
    } catch (err) {
      setDialogError((err as Error).message);
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  }
  async function remove() {
    if (!selected || actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    setDialogError("");
    try {
      await request(`/api/games/${selected.id}`, { method: "DELETE" });
      setGames((previous) =>
        previous.filter((game) => game.id !== selected.id),
      );
      setDialog(null);
      setNotice("Game deleted.");
    } catch (err) {
      setDialogError((err as Error).message);
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  }
  async function move(id: string, status: GameStatus) {
    const previous = games.find((game) => game.id === id);
    setDragged(null);
    setDropTarget(null);
    if (!previous || previous.status === status || actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    setError("");
    setGames((items) =>
      items.map((game) => (game.id === id ? { ...game, status } : game)),
    );
    try {
      const updated = await request<Game>(`/api/games/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setGames((items) =>
        items.map((game) => (game.id === id ? updated : game)),
      );
      setNotice(`${updated.title} moved to ${status}.`);
    } catch (err) {
      setGames((items) =>
        items.map((game) => (game.id === id ? previous : game)),
      );
      setError(
        `${(err as Error).message} The previous status has been restored.`,
      );
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  }
  const activeFilter =
    filters.query ||
    filters.status ||
    filters.platform ||
    filters.tag ||
    filters.rating;
  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <Gamepad2 size={24} aria-hidden="true" />
          <span>GAME LIBRARY</span>
        </div>
        <span className="session-note">
          In-memory edition <span className="session-dot" />
        </span>
      </header>
      <section className="page-heading">
        <div>
          <p className="eyebrow">YOUR COLLECTION, YOUR PACE</p>
          <h1>
            Library<span className="heading-dot">.</span>
          </h1>
          <p className="muted">Every adventure has a place.</p>
        </div>
        <div className="heading-actions">
          <div className="search-field">
            <Search size={18} aria-hidden="true" />
            <input
              aria-label="Search titles"
              placeholder="Search titles…"
              value={filters.query}
              onChange={(event) => filter("query", event.target.value)}
            />
          </div>
          <Button
            ref={addButton}
            onClick={() => open({ mode: "add" })}
            disabled={busy}
          >
            <Plus size={18} />
            Add Game
          </Button>
        </div>
      </section>
      <section className="toolbar" aria-label="Library controls">
        <div className="view-switch" role="group" aria-label="Library view">
          {(
            [
              { key: "grid", label: "Grid", Icon: LayoutGrid },
              { key: "list", label: "List", Icon: List },
              { key: "kanban", label: "Kanban", Icon: Columns3 },
            ] as const
          ).map(({ key, label, Icon }) => (
            <button
              key={key}
              aria-pressed={view === key}
              onClick={() => setView(key)}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </div>
        <div className="filters">
          <select
            aria-label="Filter by status"
            value={filters.status}
            onChange={(event) => filter("status", event.target.value)}
          >
            <option value="">All statuses</option>
            {statuses.map((status) => (
              <option key={status}>{status}</option>
            ))}
          </select>
          <select
            aria-label="Filter by platform"
            value={filters.platform}
            onChange={(event) => filter("platform", event.target.value)}
          >
            <option value="">All platforms</option>
            {platforms.map((platform) => (
              <option key={platform}>{platform}</option>
            ))}
          </select>
          <select
            aria-label="Filter by tag"
            value={filters.tag}
            onChange={(event) => filter("tag", event.target.value)}
          >
            <option value="">All tags</option>
            {tags.map((tag) => (
              <option key={tag}>{tag}</option>
            ))}
          </select>
          <select
            aria-label="Filter by rating"
            value={filters.rating}
            onChange={(event) => filter("rating", event.target.value)}
          >
            <option value="">Any rating</option>
            {Array.from({ length: 10 }, (_, index) => (
              <option key={index + 1} value={index + 1}>
                {index + 1} / 10
              </option>
            ))}
          </select>
        </div>
        <select
          className="sort-select"
          aria-label="Sort games"
          value={filters.sort}
          onChange={(event) => filter("sort", event.target.value)}
        >
          <option value="createdAt">Recently added</option>
          <option value="updatedAt">Recently updated</option>
          <option value="title">Title A to Z</option>
          <option value="releaseDate">Release date: newest</option>
          <option value="rating">Rating: highest</option>
          <option value="playtimeMinutes">Playtime: longest</option>
        </select>
      </section>
      <div className="results-bar">
        <span>
          {visible.length} {visible.length === 1 ? "game" : "games"}
          {activeFilter ? ` of ${games.length}` : ""}
        </span>
        {activeFilter && (
          <button
            onClick={() =>
              setFilters((previous) => ({
                ...initialFilters,
                sort: previous.sort,
              }))
            }
          >
            Clear filters
          </button>
        )}
        <span className="reset-note">
          Changes last until the server restarts.
        </span>
      </div>
      <p role="status" className="sr-only">
        {notice}
      </p>
      {error && (
        <div role="alert" className="error-message">
          {error}{" "}
          <Button variant="secondary" onClick={load} disabled={busy || loading}>
            Reload library
          </Button>
        </div>
      )}
      {loading ? (
        <div className="empty-state" role="status">
          <h2>Loading your library…</h2>
        </div>
      ) : !visible.length && view !== "kanban" ? (
        <div className="empty-state">
          <Gamepad2 size={48} />
          <h2>
            {activeFilter
              ? "No games found"
              : "Your next adventure starts here"}
          </h2>
          <p>
            {activeFilter
              ? "Try another title or clear your filters."
              : "Add your first game to start your collection."}
          </p>
          {!activeFilter && (
            <Button onClick={() => open({ mode: "add" })}>Add Game</Button>
          )}
        </div>
      ) : view === "grid" ? (
        <div className="game-grid">
          {visible.map((game) => (
            <button
              className="game-card"
              key={game.id}
              onClick={() => open({ mode: "detail", id: game.id })}
            >
              <div className="card-cover">
                <GameCover cover={game.cover} title={game.title} />
                <span className="status-chip">{game.status}</span>
              </div>
              <div className="card-info">
                <h2>{game.title}</h2>
                <div className="card-meta">
                  <span>{game.platforms.join(" · ") || "No platform"}</span>
                  {game.rating !== undefined && (
                    <span className="rating">
                      <Star size={13} />
                      {game.rating}
                      <small>/10</small>
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      ) : view === "list" ? (
        <div className="game-list">
          {visible.map((game) => (
            <button
              className="list-row"
              key={game.id}
              onClick={() => open({ mode: "detail", id: game.id })}
            >
              <div className="list-cover">
                <GameCover cover={game.cover} title={game.title} />
              </div>
              <div className="list-title">
                <h2>{game.title}</h2>
                <span className="muted">
                  {game.platforms.join(" · ") || "No platform"}
                </span>
              </div>
              <span className="list-tags muted">{game.tags.join(" · ")}</span>
              <span className="status-chip">{game.status}</span>
              <span className="list-rating">
                {game.rating === undefined ? "Not rated" : `${game.rating}/10`}
              </span>
              <span className="list-time muted">
                {formatPlaytime(game.playtimeMinutes)}
              </span>
              <span className="list-date muted">
                {game.releaseDate || "No release date"}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="kanban" aria-label="Game status board">
          {statuses.map((status) => (
            <section
              key={status}
              className={`kanban-column ${dropTarget === status ? "drop-active" : ""}`}
              aria-label={`${status} column`}
              onDragOver={(event) => {
                if (dragged && !busy) {
                  event.preventDefault();
                  setDropTarget(status);
                }
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node))
                  setDropTarget(null);
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (dragged) void move(dragged, status);
              }}
            >
              <h2>
                {status}
                <span>
                  {visible.filter((game) => game.status === status).length}
                </span>
              </h2>
              <div className="kanban-stack">
                {visible
                  .filter((game) => game.status === status)
                  .map((game) => (
                    <article
                      key={game.id}
                      className={`kanban-card ${dragged === game.id ? "dragging" : ""}`}
                      draggable={!busy}
                      onDragStart={(event) => {
                        event.dataTransfer.setData("text/plain", game.id);
                        event.dataTransfer.effectAllowed = "move";
                        setDragged(game.id);
                      }}
                      onDragEnd={() => {
                        setDragged(null);
                        setDropTarget(null);
                      }}
                    >
                      <button
                        className="kanban-open"
                        onClick={() => open({ mode: "detail", id: game.id })}
                      >
                        <div className="kanban-cover">
                          <GameCover cover={game.cover} title={game.title} />
                        </div>
                        <div>
                          <h3>{game.title}</h3>
                          <span className="muted">
                            {game.platforms.join(" · ")}
                          </span>
                        </div>
                      </button>
                      <select
                        aria-label={`Move ${game.title} to status`}
                        value={game.status}
                        disabled={busy}
                        onChange={(event) =>
                          void move(game.id, event.target.value as GameStatus)
                        }
                      >
                        {statuses.map((item) => (
                          <option key={item}>{item}</option>
                        ))}
                      </select>
                    </article>
                  ))}
                {!visible.some((game) => game.status === status) && (
                  <p className="column-empty">
                    {dragged ? "Drop game here" : "No games here yet"}
                  </p>
                )}
              </div>
            </section>
          ))}
        </div>
      )}
      <Dialog
        open={dialog !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen && !busy) setDialog(null);
        }}
      >
        <DialogContent
          busy={busy}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const target = opener.current?.isConnected
              ? opener.current
              : addButton.current;
            target?.focus();
          }}
        >
          <DialogTitle className="dialog-title">
            {dialog?.mode === "add"
              ? "Add a game"
              : dialog?.mode === "edit"
                ? "Edit game"
                : dialog?.mode === "delete"
                  ? "Delete game?"
                  : selected?.title || "Game details"}
          </DialogTitle>
          <DialogDescription className="dialog-description">
            {dialog?.mode === "add"
              ? "Make room for your next adventure."
              : dialog?.mode === "edit"
                ? "Keep your collection up to date."
                : dialog?.mode === "delete"
                  ? `Remove ${selected?.title} from your library? This cannot be undone.`
                  : "Your notes, progress and game details."}
          </DialogDescription>
          {dialogError && (
            <p role="alert" className="error-message">
              {dialogError}
            </p>
          )}
          {(dialog?.mode === "add" || dialog?.mode === "edit") && (
            <GameForm
              key={dialog.mode === "add" ? "new" : selected?.id}
              game={selected}
              busy={busy}
              onSave={save}
              onCancel={() => {
                setDialogError("");
                setDialog(
                  selected ? { mode: "detail", id: selected.id } : null,
                );
              }}
            />
          )}
          {dialog?.mode === "detail" && selected && (
            <>
              <div className="game-detail">
                <div className="detail-cover">
                  <GameCover cover={selected.cover} title={selected.title} />
                </div>
                <div>
                  <p className="detail-platforms">
                    {selected.platforms.join(" · ") || "No platforms set"}
                  </p>
                  <div className="tags">
                    {selected.tags.map((tag) => (
                      <span className="tag" key={tag}>
                        {tag}
                      </span>
                    ))}
                  </div>
                  <dl>
                    <div>
                      <dt>Status</dt>
                      <dd>{selected.status}</dd>
                    </div>
                    <div>
                      <dt>Rating</dt>
                      <dd>
                        {selected.rating === undefined
                          ? "Not rated"
                          : `${selected.rating} / 10`}
                      </dd>
                    </div>
                    <div>
                      <dt>Playtime</dt>
                      <dd>{formatPlaytime(selected.playtimeMinutes)}</dd>
                    </div>
                    <div>
                      <dt>Release date</dt>
                      <dd>{selected.releaseDate || "Not set"}</dd>
                    </div>
                  </dl>
                  <h3>Review</h3>
                  <p className="review">
                    {selected.review || "No review yet."}
                  </p>
                </div>
              </div>
              <div className="dialog-actions">
                <Button
                  variant="destructive"
                  disabled={busy}
                  className="delete-action"
                  onClick={() => {
                    setDialogError("");
                    setDialog({ mode: "delete", id: selected.id });
                  }}
                >
                  Delete
                </Button>
                <Button variant="secondary" onClick={() => setDialog(null)}>
                  Close
                </Button>
                <Button
                  disabled={busy}
                  onClick={() => {
                    setDialogError("");
                    setDialog({ mode: "edit", id: selected.id });
                  }}
                >
                  Edit
                </Button>
              </div>
            </>
          )}
          {dialog?.mode === "delete" && selected && (
            <div className="dialog-actions">
              <Button
                variant="secondary"
                disabled={busy}
                autoFocus
                onClick={() => {
                  setDialogError("");
                  setDialog({ mode: "detail", id: selected.id });
                }}
              >
                Keep game
              </Button>
              <Button variant="destructive" disabled={busy} onClick={remove}>
                {busy ? "Deleting…" : "Delete game"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}
