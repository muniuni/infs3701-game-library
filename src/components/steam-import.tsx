"use client";
import { useEffect, useRef, useState } from "react";
import { browserUuid } from "@/lib/browser-uuid";
import { DropdownMenu } from "radix-ui";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  LoaderCircle,
  Search,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Select } from "./ui/select";
import { GameCover } from "./game-cover";
import { IgdbAutofill } from "./igdb-autofill";
import { MetadataValue, TextDiff } from "./metadata-comparison";
import {
  formatPlaytime,
  statuses,
  type GameStatus,
  type Game,
} from "@/lib/game";
import {
  type IgdbGame,
  type MetadataField,
  type MetadataMode,
  isEmpty,
} from "@/lib/igdb";
import {
  asMetadata,
  matchSteam,
  steamChoices,
  steamFields,
  steamInput,
  steamLabels,
  steamProposal,
  type SteamChoices,
  type SteamEntry,
  type SteamOwned,
} from "@/lib/steam";

const preferenceKey = "game-library:steam-mode:v2";
const accountKey = "game-library:steam-account:v1";
type GlobalMode = "empty" | "replace" | "custom";
const globalModes = [
  ["empty", "Update if empty"],
  ["replace", "Replace current data"],
  ["custom", "Customize per game"],
] as const;
const modes = [
  ["empty", "Update if empty"],
  ["replace", "Replace current data"],
  ["manual", "Select manually"],
] as const;
async function post<T>(
  path: string,
  data: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(`/api/steam/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    signal: AbortSignal.any([
      AbortSignal.timeout(60000),
      ...(signal ? [signal] : []),
    ]),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Request failed. Try again.");
  return body;
}
type Override = { mode: MetadataMode; choices?: SteamChoices };
export function SteamImport({
  games,
  onSaved,
  onClose,
}: {
  games: Game[];
  onSaved: (games: Game[]) => void;
  onClose: () => void;
}) {
  const [library, setLibrary] = useState(games);
  const [account, setAccount] = useState("");
  const [owned, setOwned] = useState<SteamOwned[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [metadata, setMetadata] = useState<Record<number, IgdbGame>>({});
  const [lookedUp, setLookedUp] = useState<Set<number>>(new Set());
  const [overrides, setOverrides] = useState<Record<number, Override>>({});
  const [screen, setScreen] = useState<"account" | "review">("account");
  const [matching, setMatching] = useState<number>();
  const [expanded, setExpanded] = useState<number>();
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [globalMode, setGlobalMode] = useState<GlobalMode>(() => {
    try {
      const stored = localStorage.getItem(preferenceKey);
      const legacy = stored
        ? undefined
        : JSON.parse(
            localStorage.getItem("game-library:steam-preferences:v1") || "null",
          )?.mode;
      const mode = stored ?? (legacy === "manual" ? "custom" : legacy);
      return mode === "replace" || mode === "custom" ? mode : "empty";
    } catch {
      return "empty";
    }
  });
  const [statusDrafts, setStatusDrafts] = useState<Record<number, GameStatus>>(
    {},
  );
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState("");
  const [enrichError, setEnrichError] = useState("");
  const [rowErrors, setRowErrors] = useState<Record<number, string>>({});
  const [completed, setCompleted] = useState<Set<number>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const dirty = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const lock = useRef(false);
  const entries = useRef(new Map<number, SteamEntry>());
  const input = useRef<HTMLInputElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const keepEditing = useRef<HTMLButtonElement>(null);
  const lastFocus = useRef<HTMLElement | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (confirming) keepEditing.current?.focus();
    else if (screen === "account") input.current?.focus();
    else heading.current?.focus();
  }, [screen, confirming]);
  function remember(mode: GlobalMode) {
    if (mode === "custom")
      setOverrides((previous) => ({
        ...Object.fromEntries(
          rows.map((row) => [row.steam.appId, { mode: row.mode }]),
        ),
        ...previous,
      }));
    setGlobalMode(mode);
    dirty.current = true;
    entries.current.clear();
    try {
      localStorage.setItem(preferenceKey, mode);
    } catch {
      /* Optional storage. */
    }
  }
  function dismiss() {
    if (lock.current) return;
    if (dirty.current) {
      lastFocus.current = document.activeElement as HTMLElement;
      setConfirming(true);
    } else {
      controller.current?.abort();
      onClose();
    }
  }
  function resume() {
    setConfirming(false);
    requestAnimationFrame(
      () => lastFocus.current?.isConnected && lastFocus.current.focus(),
    );
  }
  const rows = owned.map((steam) => {
    const igdb = metadata[steam.appId];
    const match = matchSteam(steam, igdb, library);
    const settings =
      globalMode === "custom" ? overrides[steam.appId] : undefined;
    const mode =
      settings?.mode ?? (globalMode === "custom" ? "empty" : globalMode);
    const choices =
      (settings?.mode === "manual" ? settings.choices : undefined) ??
      steamChoices(steam, igdb, match.current, {
        fields: {},
        mode,
      });
    const proposal = steamProposal(steam, igdb, match.current);

    let invalid = "";
    try {
      steamInput(
        {
          operationId: "00000000-0000-4000-8000-000000000000",
          steam,
          igdb,
          choices,
        },
        match.current,
      );
    } catch {
      invalid = "Selected fields exceed the game limits. Adjust the selection.";
    }
    return { steam, igdb, ...match, choices, proposal, mode, invalid };
  });
  const visible = rows.filter(
    (row) =>
      !completed.has(row.steam.appId) &&
      row.steam.title.toLowerCase().includes(query.toLowerCase()) &&
      (filter === "all" ||
        (filter === "existing" ? !!row.current : !row.current)),
  );
  const chosen = rows.filter(
    (row) => selected.has(row.steam.appId) && !completed.has(row.steam.appId),
  );
  const invalid = chosen.some((row) => row.conflict || !!row.invalid);
  function toggle(id: number, checked: boolean) {
    dirty.current = true;
    setSelected((previous) => {
      const next = new Set(previous);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }
  function finishPreview(
    items: SteamOwned[],
    details: Record<number, IgdbGame>,
  ) {
    setSelected(
      new Set(
        items
          .filter((steam) => {
            const match = matchSteam(steam, details[steam.appId], library);
            return !match.current && !match.conflict;
          })
          .map((steam) => steam.appId),
      ),
    );
    setReady(true);
    setScreen("review");
  }
  async function enrich(
    items = owned,
    details = metadata,
    known = lookedUp,
    signal?: AbortSignal,
  ) {
    const abort = signal ? undefined : new AbortController();
    if (abort) {
      controller.current?.abort();
      controller.current = abort;
    }
    const active = signal ?? abort!.signal;
    setLoading(true);
    setEnrichError("");
    setReady(false);
    const ids = items
      .filter((item) => !known.has(item.appId))
      .map((item) => item.appId);
    const next = { ...details };
    setProgress({ done: items.length - ids.length, total: items.length });
    try {
      for (let offset = 0; offset < ids.length; offset += 20) {
        const results = await post<{ appId: number; game?: IgdbGame }[]>(
          "enrich",
          { appIds: ids.slice(offset, offset + 20) },
          active,
        );
        if (active.aborted) return;
        for (const row of results) if (row.game) next[row.appId] = row.game;
        setMetadata({ ...next });
        setLookedUp(
          (previous) =>
            new Set([...previous, ...results.map((row) => row.appId)]),
        );
        setProgress({
          done: Math.min(items.length - ids.length + offset + 20, items.length),
          total: items.length,
        });
      }
      finishPreview(items, next);
    } catch (err) {
      if (!active.aborted) setEnrichError((err as Error).message);
    } finally {
      if (!active.aborted) setLoading(false);
    }
  }
  async function load(value = account) {
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setScreen("review");
    setReady(false);
    setLoading(true);
    setError("");
    setEnrichError("");
    setProgress({ done: 0, total: 0 });
    setOwned([]);
    setMetadata({});
    setLookedUp(new Set());
    setOverrides({});
    setStatusDrafts({});
    setCompleted(new Set());
    setRowErrors({});
    setSelected(new Set());
    setPage(0);
    setQuery("");
    entries.current.clear();
    try {
      const result = await post<{ steamId: string; games: SteamOwned[] }>(
        "preview",
        { account: value },
        abort.signal,
      );
      if (abort.signal.aborted) return;
      setAccount(result.steamId);
      try {
        localStorage.setItem(accountKey, result.steamId);
      } catch {
        /* Optional storage. */
      }
      setOwned(result.games);
      dirty.current = false;
      await enrich(result.games, {}, new Set(), abort.signal);
    } catch (err) {
      if (!abort.signal.aborted) {
        setError((err as Error).message);
        setLoading(false);
      }
    }
  }
  useEffect(() => {
    let saved = "";
    try {
      saved = localStorage.getItem(accountKey) || "";
    } catch {
      /* Optional storage. */
    }
    const timer = window.setTimeout(() => {
      if (/^7656119\d{10}$/.test(saved)) {
        setAccount(saved);
        void load(saved);
      }
    }, 0);
    return () => window.clearTimeout(timer);
    // Read the saved account once per dialog opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function updateTime() {
    remember("custom");
    const targets = rows.filter(
      (row) =>
        row.current?.steamAppId === row.steam.appId &&
        row.steam.playtimeMinutes !== undefined &&
        row.steam.playtimeMinutes !== row.current.playtimeMinutes &&
        !completed.has(row.steam.appId),
    );
    setSelected(new Set(targets.map((row) => row.steam.appId)));
    setOverrides(
      Object.fromEntries(
        targets.map((row) => [
          row.steam.appId,
          {
            mode: "manual",
            choices: Object.fromEntries(
              steamFields.map((field) => [field, field === "playtimeMinutes"]),
            ),
          },
        ]),
      ),
    );
    // Keep metadata visible while selecting only playtime changes.
    setLookedUp(
      (previous) =>
        new Set([...previous, ...targets.map((row) => row.steam.appId)]),
    );
    setScreen("review");
    setPage(0);
    setQuery("");
  }
  function rowMode(id: number, mode: MetadataMode) {
    dirty.current = true;
    entries.current.delete(id);
    const row = rows.find((row) => row.steam.appId === id)!;
    setOverrides((previous) => ({
      ...previous,
      [id]: {
        mode,
        choices:
          previous[id]?.choices ??
          (mode === "manual" ? { ...row.choices } : undefined),
      },
    }));
  }
  function fieldChoice(
    id: number,
    field: (typeof steamFields)[number],
    checked: boolean,
  ) {
    dirty.current = true;
    entries.current.delete(id);
    const row = rows.find((row) => row.steam.appId === id)!;
    setOverrides((previous) => ({
      ...previous,
      [id]: { mode: "manual", choices: { ...row.choices, [field]: checked } },
    }));
  }
  async function save() {
    if (lock.current || loading || !chosen.length || invalid || enrichError)
      return;
    lock.current = true;
    setSaving(true);
    setError("");
    setProgress({ done: 0, total: chosen.length });
    const failures: Record<number, string> = {};
    const successes: Game[] = [];
    const done: number[] = [];
    try {
      // Small batches bound request size even with long summaries/screenshots.
      for (let offset = 0; offset < chosen.length; offset++) {
        const row = chosen[offset];
        const id = row.steam.appId;
        try {
          let entry = entries.current.get(id);
          if (!entry) {
            entry = {
              operationId: browserUuid(),
              steam: row.steam,
              igdb: row.igdb,
              targetId: row.current?.id,
              expectedUpdatedAt: row.current?.updatedAt,
              choices: row.choices,
              status: statusDrafts[id],
            };
            entries.current.set(id, entry);
          }
          const result = await post<{
            results: { appId: number; game?: Game; error?: string }[];
          }>("import", { entries: [entry] });
          const saved = result.results[0];
          if (saved?.game) {
            successes.push(saved.game);
            done.push(id);
          } else
            failures[id] =
              saved?.error ?? "Could not save this game. Try again.";
        } catch (err) {
          // Retain operation IDs: a lost response may follow a successful commit.
          failures[id] = (err as Error).message;
        }
        setProgress({ done: offset + 1, total: chosen.length });
      }
      setRowErrors(failures);
      setCompleted((previous) => new Set([...previous, ...done]));
      setSelected(
        (previous) => new Set([...previous].filter((id) => !done.includes(id))),
      );
      if (successes.length) {
        onSaved(successes);
        setLibrary((previous) => [
          ...previous.filter(
            (game) => !successes.some((saved) => saved.id === game.id),
          ),
          ...successes,
        ]);
      }
      if (!Object.keys(failures).length) onClose();
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }
  async function reloadCurrent() {
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/games", { cache: "no-store" });
      if (!response.ok) throw new Error();
      setLibrary(await response.json());
      entries.current.clear();
      setRowErrors({});
      setOverrides({});
      setScreen("review");
    } catch {
      setError("Could not reload the library. Try again.");
    } finally {
      setLoading(false);
    }
  }
  const matchRow = rows.find((row) => row.steam.appId === matching);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) dismiss();
      }}
    >
      <DialogContent
        className={confirming ? "unsaved-dialog" : "steam-dialog"}
        busy={saving}
        showClose={!confirming}
        role={confirming ? "alertdialog" : "dialog"}
        aria-describedby={undefined}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          input.current?.focus();
        }}
        onEscapeKeyDown={(event) => {
          if (saving || confirming) {
            event.preventDefault();
            if (!saving) resume();
          }
        }}
        onInteractOutside={(event) => {
          if (saving || confirming) event.preventDefault();
        }}
      >
        {confirming && (
          <div className="unsaved-icon">
            <Download size={24} />
          </div>
        )}
        <DialogTitle ref={heading} tabIndex={-1} className="dialog-title">
          {confirming ? "Review import?" : "Import Steam"}
        </DialogTitle>
        {confirming && (
          <>
            <p className="unsaved-context">{chosen.length} games selected</p>
            <div className="unsaved-actions">
              <Button
                ref={keepEditing}
                className="keep-editing"
                variant="ghost"
                onClick={resume}
              >
                Keep editing
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  controller.current?.abort();
                  onClose();
                }}
              >
                Discard
              </Button>
              <Button
                onClick={() => {
                  setConfirming(false);
                  setMatching(undefined);
                  setQuery("");
                  setPage(0);
                }}
              >
                Review import
              </Button>
            </div>
          </>
        )}
        <div className="steam-body" hidden={confirming}>
          {matchRow ? (
            <IgdbAutofill
              key={matching}
              draft={{ ...asMetadata(), title: matchRow.steam.title }}
              create
              picker
              revisiting={false}
              active
              onApply={(_, game) => {
                dirty.current = true;
                entries.current.delete(matchRow.steam.appId);
                setMetadata((previous) => ({
                  ...previous,
                  [matchRow.steam.appId]: game,
                }));
                setLookedUp(
                  (previous) => new Set([...previous, matchRow.steam.appId]),
                );
                setMatching(undefined);
              }}
              onManual={() => setMatching(undefined)}
              onBack={() => setMatching(undefined)}
              onCancel={dismiss}
            />
          ) : (
            <>
              {screen === "account" ? (
                <form
                  className="steam-account"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void load();
                  }}
                >
                  <label htmlFor="steam-account">
                    Steam profile URL or ID64
                  </label>
                  <input
                    id="steam-account"
                    ref={input}
                    value={account}
                    onChange={(event) => {
                      setAccount(event.target.value);
                      dirty.current = true;
                    }}
                    placeholder="https://steamcommunity.com/id/…"
                    autoComplete="off"
                    disabled={loading}
                  />
                  {error && (
                    <div role="alert" className="steam-error">
                      <p>{error}</p>
                      <Button variant="secondary" onClick={() => void load()}>
                        Retry
                      </Button>
                    </div>
                  )}
                  <div className="dialog-actions">
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={loading}
                      onClick={() => {
                        try {
                          localStorage.removeItem(accountKey);
                        } catch {}
                        setAccount("");
                      }}
                    >
                      Forget account
                    </Button>
                    <Button type="button" variant="secondary" onClick={dismiss}>
                      Cancel
                    </Button>
                    <Button disabled={loading || !account.trim()}>
                      {loading ? (
                        <>
                          <LoaderCircle className="steam-spinner" size={16} />
                          Loading library
                        </>
                      ) : (
                        "Load library"
                      )}
                    </Button>
                  </div>
                </form>
              ) : (
                <>
                  <div className="steam-navigation">
                    <Button
                      variant="ghost"
                      disabled={loading || saving}
                      onClick={() => {
                        setQuery("");
                        controller.current?.abort();
                        setLoading(false);
                        setScreen("account");
                      }}
                    >
                      Change account
                    </Button>
                    <span className="muted">{account}</span>
                  </div>
                  <div className="steam-tools">
                    <div className="steam-search">
                      <Search size={16} />
                      <input
                        aria-label="Search Steam games"
                        placeholder="Search games"
                        value={query}
                        onChange={(event) => {
                          setQuery(event.target.value);
                          setPage(0);
                        }}
                        disabled={saving}
                      />
                    </div>
                    {ready && (
                      <Select
                        label="Filter Steam games"
                        value={filter}
                        onValueChange={(value) => {
                          setFilter(value);
                          setPage(0);
                        }}
                        options={[
                          { value: "all", label: "All games" },
                          { value: "new", label: "New" },
                          { value: "existing", label: "Existing" },
                        ]}
                      />
                    )}
                    {ready && (
                      <Button
                        variant="secondary"
                        disabled={
                          loading ||
                          saving ||
                          !rows.some(
                            (row) =>
                              row.current?.steamAppId === row.steam.appId &&
                              row.steam.playtimeMinutes !== undefined &&
                              row.steam.playtimeMinutes !==
                                row.current.playtimeMinutes,
                          )
                        }
                        onClick={updateTime}
                      >
                        Update playtime
                      </Button>
                    )}
                  </div>
                  <div className="steam-selection">
                    {ready && (
                      <label>
                        <input
                          type="checkbox"
                          aria-label="Select filtered games"
                          disabled={
                            loading ||
                            saving ||
                            !visible.some((row) => !row.conflict)
                          }
                          checked={
                            visible.some((row) => !row.conflict) &&
                            visible
                              .filter((row) => !row.conflict)
                              .every((row) => selected.has(row.steam.appId))
                          }
                          onChange={(event) => {
                            const checked = event.target.checked;
                            dirty.current = true;
                            setSelected((previous) => {
                              const next = new Set(previous);
                              visible
                                .filter((row) => !row.conflict)
                                .forEach((row) => {
                                  if (checked) next.add(row.steam.appId);
                                  else next.delete(row.steam.appId);
                                });
                              return next;
                            });
                          }}
                        />
                        Select filtered games
                      </label>
                    )}
                    <span>{chosen.length} selected</span>
                    <span className="muted">
                      {globalModes.find(([value]) => value === globalMode)?.[1]}
                    </span>
                  </div>
                  <div className="steam-list" aria-busy={loading || saving}>
                    {loading && (
                      <div className="steam-progress" role="status">
                        <LoaderCircle size={16} className="steam-spinner" />
                        {progress.total
                          ? `Loading metadata ${progress.done} / ${progress.total}`
                          : "Loading library"}
                      </div>
                    )}
                    {loading && (
                      <div className="search-skeletons" aria-hidden="true">
                        {[0, 1, 2, 3, 4].map((index) => (
                          <div className="search-skeleton" key={index}>
                            <i />
                            <div>
                              <i />
                              <i />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {ready && !visible.length && (
                      <p className="steam-empty">
                        {owned.length
                          ? "No games selected or matching this filter."
                          : "No games returned by Steam."}
                      </p>
                    )}
                    {ready &&
                      visible.slice(page * 50, (page + 1) * 50).map((row) => {
                        const id = row.steam.appId,
                          open = expanded === id;
                        const before = asMetadata(row.current),
                          after = { ...before, ...row.proposal };
                        return (
                          <article
                            className={`steam-row ${selected.has(id) ? "is-selected" : ""}`}
                            key={id}
                          >
                            <div className="steam-row-header">
                              <input
                                type="checkbox"
                                aria-label={`Import ${row.steam.title}`}
                                checked={selected.has(id)}
                                disabled={saving || loading || row.conflict}
                                onChange={(event) =>
                                  toggle(id, event.target.checked)
                                }
                              />
                              <div className="steam-row-cover">
                                <GameCover
                                  cover={
                                    row.igdb?.cover ??
                                    row.current?.cover ?? {
                                      type: "placeholder",
                                    }
                                  }
                                  title={row.steam.title}
                                />
                              </div>
                              <button
                                className="steam-row-title"
                                aria-expanded={open}
                                disabled={saving}
                                onClick={() =>
                                  setExpanded(open ? undefined : id)
                                }
                              >
                                <strong>{row.steam.title}</strong>
                                <span>
                                  {row.conflict
                                    ? "Identity conflict"
                                    : row.titleOnly
                                      ? `Link to ${row.current!.title}`
                                      : row.current
                                        ? "Existing"
                                        : "New"}{" "}
                                  · {formatPlaytime(row.steam.playtimeMinutes)}
                                </span>
                              </button>
                              <Select
                                className="steam-status"
                                label={`Status for ${row.steam.title}`}
                                value={
                                  statusDrafts[id] ??
                                  row.current?.status ??
                                  "Unplayed"
                                }
                                options={statuses.map((value) => ({
                                  value,
                                  label: value,
                                }))}
                                disabled={saving || row.conflict}
                                onValueChange={(value) => {
                                  setStatusDrafts((previous) => ({
                                    ...previous,
                                    [id]: value as GameStatus,
                                  }));
                                  entries.current.delete(id);
                                  toggle(id, true);
                                }}
                              />
                              <Button
                                variant="ghost"
                                className="button-icon"
                                aria-label={`Review ${row.steam.title}`}
                                disabled={saving}
                                onClick={() =>
                                  setExpanded(open ? undefined : id)
                                }
                              >
                                {open ? (
                                  <ChevronDown size={18} />
                                ) : (
                                  <ChevronRight size={18} />
                                )}
                              </Button>
                            </div>
                            {rowErrors[id] && (
                              <p className="error-message" role="alert">
                                {rowErrors[id]}
                              </p>
                            )}
                            {row.conflict && (
                              <p className="error-message">
                                Conflicting library identities. Choose another
                                match or skip this game.
                              </p>
                            )}
                            {open && (
                              <div className="steam-row-detail">
                                <div className="steam-row-tools">
                                  {globalMode === "custom" && (
                                    <Select
                                      label={`Update mode for ${row.steam.title}`}
                                      value={row.mode}
                                      onValueChange={(value) =>
                                        rowMode(id, value as MetadataMode)
                                      }
                                      options={modes.map(([value, label]) => ({
                                        value,
                                        label,
                                      }))}
                                      disabled={saving || loading}
                                    />
                                  )}
                                  <Button
                                    variant="ghost"
                                    disabled={saving || loading}
                                    onClick={() => setMatching(id)}
                                  >
                                    {row.igdb
                                      ? "Find another game"
                                      : "Find a match"}
                                  </Button>
                                  {row.igdb && (
                                    <span className="muted">
                                      {row.igdb.title}
                                    </span>
                                  )}
                                </div>
                                <table className="metadata-table">
                                  <thead>
                                    <tr>
                                      <th>Field</th>
                                      <th>Before</th>
                                      <th>After</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {steamFields.map((field) => {
                                      const available =
                                        !isEmpty(row.proposal[field]) &&
                                        JSON.stringify(row.proposal[field]) !==
                                          JSON.stringify(row.current?.[field]);
                                      const checked =
                                        !!row.choices[field] && available;
                                      return (
                                        <tr
                                          key={field}
                                          className={
                                            checked ? "" : "is-excluded"
                                          }
                                        >
                                          <th scope="row">
                                            {globalMode === "custom" &&
                                            row.mode === "manual" ? (
                                              <label className="diff-choice">
                                                <input
                                                  type="checkbox"
                                                  aria-label={`Update ${steamLabels[field]} for ${row.steam.title}`}
                                                  checked={checked}
                                                  disabled={
                                                    !available ||
                                                    saving ||
                                                    loading
                                                  }
                                                  onChange={(event) =>
                                                    fieldChoice(
                                                      id,
                                                      field,
                                                      event.target.checked,
                                                    )
                                                  }
                                                />
                                                {steamLabels[field]}
                                              </label>
                                            ) : (
                                              steamLabels[field]
                                            )}
                                          </th>
                                          {field === "playtimeMinutes" ||
                                          field === "platforms" ? (
                                            [false, true].map((isAfter) => {
                                              const oldText =
                                                field === "playtimeMinutes"
                                                  ? formatPlaytime(
                                                      row.current
                                                        ?.playtimeMinutes,
                                                    )
                                                  : row.current?.platforms.join(
                                                      ", ",
                                                    ) || "Not set";
                                              const newText =
                                                field === "playtimeMinutes"
                                                  ? formatPlaytime(
                                                      row.steam.playtimeMinutes,
                                                    )
                                                  : (
                                                      row.proposal
                                                        .platforms as string[]
                                                    ).join(", ");
                                              return (
                                                <td
                                                  key={String(isAfter)}
                                                  data-label={
                                                    isAfter ? "After" : "Before"
                                                  }
                                                >
                                                  <TextDiff
                                                    value={
                                                      isAfter
                                                        ? newText
                                                        : oldText
                                                    }
                                                    other={
                                                      isAfter
                                                        ? oldText
                                                        : newText
                                                    }
                                                    after={isAfter}
                                                  />
                                                </td>
                                              );
                                            })
                                          ) : (
                                            <>
                                              <td data-label="Before">
                                                <MetadataValue
                                                  field={field as MetadataField}
                                                  draft={before}
                                                  other={after}
                                                  after={false}
                                                />
                                              </td>
                                              <td data-label="After">
                                                <MetadataValue
                                                  field={field as MetadataField}
                                                  draft={after}
                                                  other={before}
                                                  after
                                                />
                                              </td>
                                            </>
                                          )}
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                                {row.invalid && (
                                  <p role="alert" className="error-message">
                                    {row.invalid}
                                  </p>
                                )}
                              </div>
                            )}
                          </article>
                        );
                      })}
                  </div>
                  {visible.length > 50 && (
                    <div className="steam-pagination">
                      <Button
                        variant="ghost"
                        disabled={!page || saving}
                        onClick={() => setPage((value) => value - 1)}
                      >
                        Previous
                      </Button>
                      <span>
                        {page + 1} / {Math.ceil(visible.length / 50)}
                      </span>
                      <Button
                        variant="ghost"
                        disabled={(page + 1) * 50 >= visible.length || saving}
                        onClick={() => setPage((value) => value + 1)}
                      >
                        Next
                      </Button>
                    </div>
                  )}
                  {enrichError && (
                    <div className="steam-error" role="alert">
                      <p>{enrichError}</p>
                      <Button
                        variant="secondary"
                        disabled={loading}
                        onClick={() => void enrich()}
                      >
                        Retry metadata
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={loading}
                        onClick={() => {
                          setEnrichError("");
                          finishPreview(owned, metadata);
                          setLookedUp(
                            (previous) =>
                              new Set([
                                ...previous,
                                ...chosen.map((row) => row.steam.appId),
                              ]),
                          );
                        }}
                      >
                        Continue without missing metadata
                      </Button>
                    </div>
                  )}
                  {error && (
                    <div role="alert" className="steam-error">
                      <p>{error}</p>
                      <Button variant="secondary" onClick={() => void load()}>
                        Retry
                      </Button>
                    </div>
                  )}
                  {Object.keys(rowErrors).length > 0 && (
                    <div className="steam-error">
                      <span>
                        {completed.size} imported ·{" "}
                        {Object.keys(rowErrors).length} failed
                      </span>
                      <Button
                        variant="ghost"
                        disabled={saving || loading}
                        onClick={() => void reloadCurrent()}
                      >
                        Reload library
                      </Button>
                    </div>
                  )}
                  <div className="dialog-actions steam-footer">
                    <Button
                      variant="secondary"
                      disabled={saving}
                      onClick={dismiss}
                    >
                      Cancel
                    </Button>
                    {saving ? (
                      <span role="status" className="loading-indicator">
                        <LoaderCircle size={16} />
                        Importing {progress.done} / {progress.total}
                      </span>
                    ) : (
                      <div className="split-button">
                        <Button
                          disabled={
                            !ready ||
                            loading ||
                            !chosen.length ||
                            invalid ||
                            !!enrichError
                          }
                          onClick={() => void save()}
                        >
                          {Object.keys(rowErrors).length ? "Retry" : "Import"}{" "}
                          {chosen.length}{" "}
                          {chosen.length === 1 ? "game" : "games"}
                        </Button>
                        <DropdownMenu.Root>
                          <DropdownMenu.Trigger asChild>
                            <Button
                              disabled={loading}
                              aria-label="Choose import update mode"
                            >
                              <ChevronDown size={16} />
                            </Button>
                          </DropdownMenu.Trigger>
                          <DropdownMenu.Portal>
                            <DropdownMenu.Content
                              className="metadata-menu"
                              align="end"
                              sideOffset={6}
                            >
                              <DropdownMenu.RadioGroup
                                value={globalMode}
                                onValueChange={(value) =>
                                  remember(value as GlobalMode)
                                }
                              >
                                {globalModes.map(([value, label]) => (
                                  <DropdownMenu.RadioItem
                                    className="metadata-menu-item"
                                    key={value}
                                    value={value}
                                  >
                                    {label}
                                    <DropdownMenu.ItemIndicator>
                                      <Check size={15} />
                                    </DropdownMenu.ItemIndicator>
                                  </DropdownMenu.RadioItem>
                                ))}
                              </DropdownMenu.RadioGroup>
                            </DropdownMenu.Content>
                          </DropdownMenu.Portal>
                        </DropdownMenu.Root>
                      </div>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
