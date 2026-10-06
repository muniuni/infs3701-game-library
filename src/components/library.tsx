"use client";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Columns3,
  Clock3,
  Pencil,
  Trash2,
  X,
  Gamepad2,
  LayoutGrid,
  List,
  Plus,
  Search,
  Star,
} from "lucide-react";
import { Button } from "./ui/button";
import { Select } from "./ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "./ui/dialog";
import { GameCover } from "./game-cover";
import { GameForm, type GameFormHandle } from "./game-form";
import {
  formatPlaytime,
  statuses,
  type UpdateGameInput,
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
    headers: {
      ...(init?.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...init?.headers,
    },
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
  const [notice, setNotice] = useState<{ message: string } | null>(null);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);
  const [view, setView] = useState<Mode>("grid");
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const gameForm = useRef<GameFormHandle>(null);
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const [busy, setBusy] = useState(false);
  const [dragged, setDragged] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const actionLock = useRef(false);
  const searchInput = useRef<HTMLInputElement>(null);
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
  async function save(input: UpdateGameInput, image?: File) {
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    setDialogError("");
    try {
      let body: string | FormData = JSON.stringify(input);
      if (image) {
        body = new FormData();
        body.append("input", JSON.stringify(input));
        body.append("cover", image);
      }
      const game = await request<Game>(
        selected ? `/api/games/${selected.id}` : "/api/games",
        { method: selected ? "PATCH" : "POST", body },
      );
      setGames((previous) =>
        selected
          ? previous.map((item) => (item.id === game.id ? game : item))
          : [...previous, game],
      );
      setDialog({ mode: "detail", id: game.id });
      setNotice({ message: `${game.title} saved.` });
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
      setNotice({ message: `${selected.title} deleted.` });
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
    setDialogError("");
    setNotice(null);
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
      setNotice({ message: `${updated.title} moved to ${status}.` });
    } catch (err) {
      setGames((items) =>
        items.map((game) => (game.id === id ? previous : game)),
      );
      const message = `${(err as Error).message} The previous status has been restored.`;
      if (dialog?.mode === "detail") setDialogError(message);
      else setError(message);
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
      <header className="library-header">
        <div className="topbar">
          <div className="brand">
            <Gamepad2 size={24} aria-hidden="true" />
            <span>GAME LIBRARY</span>
          </div>
        </div>
        <section className="page-heading">
          <div>
            <h1>
              Library<span className="heading-dot">.</span>
            </h1>
          </div>
          <div className="heading-actions">
            <div className="search-field">
              <Search size={18} aria-hidden="true" />
              <input
                ref={searchInput}
                aria-label="Search titles"
                placeholder="Search titles…"
                value={filters.query}
                onChange={(event) => filter("query", event.target.value)}
              />
              {filters.query && (
                <button
                  className="search-clear"
                  aria-label="Clear search"
                  onClick={() => {
                    filter("query", "");
                    searchInput.current?.focus();
                  }}
                >
                  <X size={15} aria-hidden="true" />
                </button>
              )}
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
      </header>
      <div className="library-layout">
        <aside className="filter-sidebar" aria-label="Library filters">
          <details className="filter-disclosure" open>
            <summary>Filters</summary>
            <div className="filter-sections">
              <div
                className="filter-group"
                role="group"
                aria-label="Filter by rating"
              >
                <h2>
                  Minimum rating{" "}
                  <span>
                    {filters.rating ? `${filters.rating}+ / 10` : "Any"}
                  </span>
                </h2>
                <div className="rating-filter">
                  <input
                    type="range"
                    min={0}
                    max={10}
                    step={1}
                    value={filters.rating || "0"}
                    aria-label="Filter by rating"
                    aria-valuetext={
                      filters.rating
                        ? `${filters.rating} out of 10 or higher`
                        : "Any rating"
                    }
                    onChange={(event) =>
                      filter(
                        "rating",
                        event.target.value === "0" ? "" : event.target.value,
                      )
                    }
                  />
                  <div className="rating-scale" aria-hidden="true">
                    {Array.from({ length: 11 }, (_, rating) => (
                      <span className="rating-tick" key={rating}>
                        <span>
                          {rating === 0
                            ? "Any"
                            : rating === 5 || rating === 10
                              ? rating
                              : ""}
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
                <button
                  className="any-rating"
                  aria-pressed={!filters.rating}
                  onClick={() => filter("rating", "")}
                >
                  Any rating
                </button>
              </div>
              {(
                [
                  {
                    key: "status",
                    label: "Status",
                    all: "All statuses",
                    options: [...statuses],
                  },
                  {
                    key: "platform",
                    label: "Platform",
                    all: "All platforms",
                    options: platforms,
                  },
                  { key: "tag", label: "Tags", all: "All tags", options: tags },
                ] as const
              ).map(({ key, label, all, options }) => (
                <div
                  className={`filter-group filter-${key}`}
                  role="group"
                  aria-label={`Filter by ${key}`}
                  key={key}
                >
                  <h2>{label}</h2>
                  <div className="filter-options">
                    <button
                      aria-pressed={!filters[key]}
                      onClick={() => filter(key, "")}
                    >
                      {all}
                    </button>
                    {options.map((option) => (
                      <button
                        key={option}
                        aria-pressed={filters[key] === option}
                        onClick={() =>
                          filter(key, filters[key] === option ? "" : option)
                        }
                      >
                        <span>{option}</span>
                        {key === "status" && (
                          <small>
                            {
                              games.filter((game) => game.status === option)
                                .length
                            }
                          </small>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </details>
        </aside>
        <div className="library-content">
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
            <Select
              className="sort-select"
              label="Sort games"
              value={filters.sort}
              onValueChange={(value) => filter("sort", value)}
              options={[
                { value: "createdAt", label: "Recently added" },
                { value: "updatedAt", label: "Recently updated" },
                { value: "title", label: "Title A to Z" },
                { value: "releaseDate", label: "Release date: newest" },
                { value: "rating", label: "Rating: highest" },
                { value: "playtimeMinutes", label: "Playtime: longest" },
              ]}
            />
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
          </div>
          {(filters.status ||
            filters.platform ||
            filters.tag ||
            filters.rating) && (
            <div
              className="active-filters"
              role="group"
              aria-label="Active filters"
            >
              {(["status", "platform", "tag", "rating"] as const)
                .filter((key) => filters[key])
                .map((key) => (
                  <button
                    key={key}
                    aria-label={`Remove ${key} filter`}
                    onClick={() => filter(key, "")}
                  >
                    <span className="active-filter-label">
                      {key === "rating"
                        ? "Rating"
                        : key === "tag"
                          ? "Tag"
                          : key === "platform"
                            ? "Platform"
                            : "Status"}
                    </span>
                    <span>
                      {filters[key]}
                      {key === "rating" ? "+" : ""}
                    </span>
                    <X size={12} aria-hidden="true" />
                  </button>
                ))}
            </div>
          )}
          {error && (
            <div role="alert" className="error-message">
              {error}{" "}
              <Button
                variant="secondary"
                onClick={load}
                disabled={busy || loading}
              >
                Reload library
              </Button>
            </div>
          )}
          {loading ? (
            <div className="empty-state" role="status">
              <h2>Loading your library…</h2>
            </div>
          ) : !visible.length ? (
            <div className="empty-state">
              <Gamepad2 size={48} />
              <h2>{activeFilter ? "No games found" : "No games yet"}</h2>
              <p>
                {activeFilter
                  ? "Try another title or clear your filters."
                  : "Add your first game to start your collection."}
              </p>
              {activeFilter ? (
                <Button
                  variant="secondary"
                  onClick={() =>
                    setFilters((previous) => ({
                      ...initialFilters,
                      sort: previous.sort,
                    }))
                  }
                >
                  Reset search and filters
                </Button>
              ) : (
                <Button onClick={() => open({ mode: "add" })}>Add Game</Button>
              )}
            </div>
          ) : view === "grid" ? (
            <div className="game-grid">
              {visible.map((game) => (
                <article className="game-card" key={game.id}>
                  <button
                    className="game-card-open"
                    onClick={() => open({ mode: "detail", id: game.id })}
                  >
                    <div className="card-cover">
                      <GameCover cover={game.cover} title={game.title} />
                    </div>
                    <div className="card-info">
                      <h2>{game.title}</h2>
                      <div className="card-meta">
                        <span>
                          {game.platforms.join(" · ") || "No platform"}
                        </span>
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
                  <div className="card-quick-status">
                    <Select
                      label={`Change ${game.title} status`}
                      value={game.status}
                      disabled={busy}
                      onValueChange={(value) =>
                        void move(game.id, value as GameStatus)
                      }
                      options={statuses.map((status) => ({
                        value: status,
                        label: status,
                      }))}
                    />
                  </div>
                </article>
              ))}
            </div>
          ) : view === "list" ? (
            <div className="game-list">
              <div className="list-header" aria-hidden="true">
                <span />
                <span>Game</span>
                <span className="list-tags">Tags</span>
                <span>Status</span>
                <span className="list-rating">Rating</span>
                <span className="list-time">Playtime</span>
                <span className="list-date">Released</span>
              </div>
              {visible.map((game) => (
                <div className="list-row" key={game.id}>
                  <button
                    className="list-open"
                    aria-label={`Open ${game.title}`}
                    onClick={() => open({ mode: "detail", id: game.id })}
                  />
                  <div className="list-cover">
                    <GameCover cover={game.cover} title={game.title} />
                  </div>
                  <div className="list-title">
                    <h2>{game.title}</h2>
                    <span className="muted">
                      {game.platforms.join(" · ") || "No platform"}
                    </span>
                  </div>
                  <span className="list-tags tags">
                    {game.tags.slice(0, 2).map((tag) => (
                      <span className="tag" key={tag}>
                        {tag}
                      </span>
                    ))}
                    {game.tags.length > 2 && (
                      <span className="muted">+{game.tags.length - 2}</span>
                    )}
                  </span>
                  <div className="list-status quick-status">
                    <Select
                      label={`Change ${game.title} status`}
                      value={game.status}
                      disabled={busy}
                      onValueChange={(value) =>
                        void move(game.id, value as GameStatus)
                      }
                      options={statuses.map((status) => ({
                        value: status,
                        label: status,
                      }))}
                    />
                  </div>
                  <span className="list-rating rating">
                    {game.rating === undefined ? (
                      <span className="muted">Unrated</span>
                    ) : (
                      <>
                        <Star size={13} />
                        <strong>{game.rating}</strong>
                        <small>/10</small>
                      </>
                    )}
                  </span>
                  <span className="list-time muted">
                    {formatPlaytime(game.playtimeMinutes)}
                  </span>
                  <span className="list-date muted">
                    {game.releaseDate || "Not set"}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div
              className="kanban"
              role="region"
              tabIndex={0}
              aria-label="Game status board"
            >
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
                    if (
                      !event.currentTarget.contains(event.relatedTarget as Node)
                    )
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
                            onClick={() =>
                              open({ mode: "detail", id: game.id })
                            }
                          >
                            <div className="kanban-cover">
                              <GameCover
                                cover={game.cover}
                                title={game.title}
                              />
                            </div>
                            <div>
                              <h3>{game.title}</h3>
                              <span className="muted">
                                {game.platforms.join(" · ") || "No platform"}
                              </span>
                            </div>
                          </button>
                          <div className="kanban-meta">
                            <span className="kanban-playtime">
                              <Clock3 size={12} aria-hidden="true" />
                              {formatPlaytime(game.playtimeMinutes)}
                            </span>
                            {game.rating !== undefined && (
                              <span className="rating">
                                <Star size={12} />
                                {game.rating}
                                <small>/10</small>
                              </span>
                            )}
                          </div>
                          <Select
                            label={`Move ${game.title} to status`}
                            value={game.status}
                            disabled={busy}
                            onValueChange={(value) =>
                              void move(game.id, value as GameStatus)
                            }
                            options={statuses.map((status) => ({
                              value: status,
                              label: status,
                            }))}
                          />
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
        </div>
      </div>
      <Dialog
        open={dialog !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen && !busy && !gameForm.current?.dismissAutofill())
            setDialog(null);
        }}
      >
        <DialogContent
          className={
            dialog?.mode === "detail"
              ? "detail-dialog"
              : dialog?.mode === "add" || dialog?.mode === "edit"
                ? "form-dialog"
                : undefined
          }
          busy={busy}
          {...(dialog?.mode === "add" || dialog?.mode === "edit"
            ? { "aria-describedby": undefined }
            : {})}
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
          {(dialog?.mode === "detail" || dialog?.mode === "delete") && (
            <DialogDescription
              className={
                dialog?.mode === "detail" ? "sr-only" : "dialog-description"
              }
            >
              {dialog?.mode === "delete"
                ? `Remove ${selected?.title} from your library? This cannot be undone.`
                : "Your notes, progress and game details."}
            </DialogDescription>
          )}
          {dialogError && (
            <p role="alert" className="error-message">
              {dialogError}
            </p>
          )}
          {(dialog?.mode === "add" || dialog?.mode === "edit") && (
            <GameForm
              ref={gameForm}
              key={dialog.mode === "add" ? "new" : selected?.id}
              game={selected}
              platforms={platforms}
              tags={tags}
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
                <div className="detail-metadata">
                  <dl className="detail-primary">
                    <div>
                      <dt>Status</dt>
                      <dd>
                        <Select
                          label={`Change ${selected.title} status`}
                          value={selected.status}
                          disabled={busy}
                          onValueChange={(value) =>
                            void move(selected.id, value as GameStatus)
                          }
                          options={statuses.map((status) => ({
                            value: status,
                            label: status,
                          }))}
                        />
                      </dd>
                    </div>
                    <div className="detail-rating">
                      <dt>Rating</dt>
                      <dd>
                        <span
                          className="rating-stars"
                          role="img"
                          aria-label={
                            selected.rating === undefined
                              ? "Not rated"
                              : `${selected.rating} out of 10`
                          }
                        >
                          {Array.from({ length: 10 }, (_, index) => (
                            <Star
                              key={index}
                              size={18}
                              aria-hidden="true"
                              className={
                                index < (selected.rating ?? 0)
                                  ? "star-filled"
                                  : "star-empty"
                              }
                              fill={
                                index < (selected.rating ?? 0)
                                  ? "currentColor"
                                  : "none"
                              }
                            />
                          ))}
                        </span>
                        <span className="rating-caption" aria-hidden="true">
                          {selected.rating === undefined
                            ? "Not rated"
                            : `${selected.rating} / 10`}
                        </span>
                      </dd>
                    </div>
                  </dl>
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
                  <dl className="detail-secondary">
                    <div>
                      <dt>Playtime</dt>
                      <dd
                        className={
                          selected.playtimeMinutes === undefined
                            ? "muted"
                            : undefined
                        }
                      >
                        {formatPlaytime(selected.playtimeMinutes)}
                      </dd>
                    </div>
                    <div>
                      <dt>Release date</dt>
                      <dd
                        className={!selected.releaseDate ? "muted" : undefined}
                      >
                        {selected.releaseDate || "Not set"}
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>
              <section
                className={`detail-review${!selected.review ? " is-empty" : ""}`}
                aria-label="Review"
              >
                <h3>Review</h3>
                <p
                  className={`review ${!selected.review ? "review-empty" : ""}`}
                >
                  {selected.review || "No review yet."}
                </p>
              </section>
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
                  <Trash2 size={15} aria-hidden="true" /> Delete
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
                  <Pencil size={15} aria-hidden="true" /> Edit
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
      {notice &&
        createPortal(
          <div
            className="success-notice"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            <Check size={16} aria-hidden="true" />
            {notice.message}
          </div>,
          document.body,
        )}
    </main>
  );
}
