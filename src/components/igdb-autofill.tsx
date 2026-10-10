"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useImperativeHandle,
  type Ref,
} from "react";
import { z } from "zod";
import { ChevronLeft, LoaderCircle } from "lucide-react";
import {
  igdbGameSchema,
  metadataChoices,
  applyMetadata,
  type IgdbGame,
  type MetadataDraft,
  type MetadataChoices,
} from "@/lib/igdb";
import { Button } from "./ui/button";
import { GameCover } from "./game-cover";
import { GameMetadata } from "./game-metadata";
import { MetadataComparison } from "./metadata-comparison";

export type AutofillHandle = {
  focus: () => void;
  hasSearchChanges: () => boolean;
  pending: () =>
    | { draft: MetadataDraft; game?: IgdbGame; replaceCover?: boolean }
    | undefined;
};
export function IgdbAutofill({
  ref,
  draft,
  igdbId,
  create,
  revisiting,
  picker = false,
  active: visible,
  onApply,
  onManual,
  onCancel,
  onBack,
}: {
  ref?: Ref<AutofillHandle>;
  draft: MetadataDraft;
  igdbId?: number;
  create: boolean;
  revisiting: boolean;
  picker?: boolean;
  active: boolean;
  onApply: (
    next: MetadataDraft,
    game: IgdbGame,
    choices: MetadataChoices,
  ) => void;
  onManual: (title: string) => void;
  onCancel: () => void;
  onBack: () => void;
}) {
  const comparison =
    useRef<import("./metadata-comparison").ComparisonHandle>(null);
  const [query, setQuery] = useState(draft.title);
  const [results, setResults] = useState<IgdbGame[]>([]);
  const [selected, setSelected] = useState<IgdbGame>();
  const [screen, setScreen] = useState<"search" | "preview" | "compare">(
    !create && igdbId ? "compare" : "search",
  );
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [composing, setComposing] = useState(false);
  const [active, setActive] = useState(-1);
  const [searchVersion, setSearchVersion] = useState(0);
  const searchInput = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => ({
    focus: () => searchInput.current?.focus(),
    hasSearchChanges: () => query !== draft.title,
    pending: () => {
      if (screen === "search")
        return { draft: { ...draft, title: draft.title || query.trim() } };
      if (loading || error) return undefined;
      if (screen === "compare") return comparison.current?.pending();
      if (screen === "preview" && selected) {
        const choices = metadataChoices(draft, selected, "replace");
        return {
          draft: applyMetadata(draft, selected, choices),
          game: selected,
          replaceCover: choices.cover,
        };
      }
      return { draft: { ...draft, title: draft.title || query.trim() } };
    },
  }));
  const lastLoad = useRef<{ url: string; detail: boolean } | undefined>(
    undefined,
  );
  const controller = useRef<AbortController | null>(null);
  const immediate = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const resultList = useRef<HTMLDivElement>(null);
  const lastQuery = useRef<string | undefined>(undefined);
  const scroll = useRef(0);
  const load = useCallback(
    async (url: string, detail: boolean) => {
      lastLoad.current = { url, detail };
      controller.current?.abort();
      const request = new AbortController();
      controller.current = request;
      setLoading(true);
      setError("");
      try {
        const response = await fetch(url, {
          cache: "no-store",
          signal: request.signal,
        });
        const body = await response.json();
        if (!response.ok)
          throw new Error(
            typeof body.error === "string"
              ? body.error
              : "Unable to load game metadata.",
          );
        if (request.signal.aborted) return;
        if (detail) {
          setSelected(igdbGameSchema.parse(body));
          setScreen(create ? "preview" : "compare");
        } else {
          setResults(z.array(igdbGameSchema).max(20).parse(body));
          setSearched(true);
          setActive(-1);
        }
      } catch (error) {
        if (!request.signal.aborted)
          setError(
            error instanceof z.ZodError
              ? "Invalid game metadata."
              : error instanceof Error
                ? error.message
                : "Unable to load game metadata.",
          );
      } finally {
        if (!request.signal.aborted) setLoading(false);
      }
    },
    [create],
  );
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!create && igdbId) void load(`/api/igdb/games/${igdbId}`, true);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.current?.abort();
    };
  }, [create, igdbId, load]);
  useEffect(() => {
    if (!visible || screen !== "search" || !query.trim() || composing) return;
    if (!immediate.current && lastQuery.current === query) return;
    const delay = immediate.current ? 0 : 150;
    immediate.current = false;
    const timer = window.setTimeout(() => {
      lastQuery.current = query;
      void load(
        `/api/igdb/search?q=${encodeURIComponent(query.trim())}`,
        false,
      );
    }, delay);
    return () => {
      window.clearTimeout(timer);
      controller.current?.abort();
    };
  }, [query, screen, composing, load, searchVersion, visible]);
  useEffect(() => {
    if (!visible) return;
    const frame = requestAnimationFrame(() =>
      (screen === "search" ? searchInput.current : heading.current)?.focus(),
    );
    return () => cancelAnimationFrame(frame);
  }, [screen, selected, visible]);
  useEffect(() => {
    resultList.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);
  function search() {
    immediate.current = true;
    setSearchVersion((value) => value + 1);
  }
  function pick(game: IgdbGame) {
    scroll.current = resultList.current?.scrollTop ?? 0;
    void load(`/api/igdb/games/${game.id}`, true);
  }
  function back() {
    controller.current?.abort();
    setLoading(false);
    setError("");
    if (screen === "compare" && create) setScreen("preview");
    else if (screen === "preview") {
      setScreen("search");
      requestAnimationFrame(() => {
        if (resultList.current) resultList.current.scrollTop = scroll.current;
      });
    } else if (screen === "search" && selected && !create) setScreen("compare");
    else if (screen === "search" && create && !revisiting && !picker)
      onCancel();
    else onBack();
  }
  const feedback = (
    <>
      {loading && (
        <div
          role="status"
          className="metadata-loading"
          aria-label={screen === "search" ? "Searching games" : "Loading game"}
        >
          <div className="loading-indicator">
            <LoaderCircle size={18} aria-hidden="true" />
            <span>
              {screen === "search" ? "Searching games" : "Loading game"}
            </span>
          </div>
          <div className="search-skeletons" aria-hidden="true">
            {[0, 1, 2].map((index) => (
              <div className="search-skeleton" key={index}>
                <i />
                <div>
                  <i />
                  <i />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {error && (
        <div className="metadata-error">
          <p role="alert" className="error-message">
            {error}
          </p>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              if (lastLoad.current)
                void load(lastLoad.current.url, lastLoad.current.detail);
            }}
          >
            Retry
          </Button>
          {screen === "compare" && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => setScreen("search")}
            >
              Find another game
            </Button>
          )}
        </div>
      )}
    </>
  );
  return (
    <section
      data-screen={screen}
      className="igdb-workflow"
      aria-label={create ? "Find a game" : "Update metadata"}
    >
      <div className="workflow-heading">
        <Button type="button" variant="ghost" onClick={back}>
          {screen === "search" && create && !revisiting && !picker ? (
            "Cancel"
          ) : (
            <>
              <ChevronLeft size={16} />
              Back
            </>
          )}
        </Button>
        <h3 ref={heading} tabIndex={-1}>
          {screen === "search"
            ? "Find a game"
            : screen === "preview"
              ? "Confirm game"
              : "Update metadata"}
        </h3>
      </div>
      <div hidden={screen !== "search"}>
        <div className="game-search-bar">
          <input
            ref={searchInput}
            aria-label="Search game title"
            placeholder="Search for a game"
            maxLength={160}
            autoComplete="off"
            value={query}
            role="combobox"
            aria-expanded={!!results.length && !composing}
            aria-controls="igdb-results"
            aria-activedescendant={
              active >= 0 ? `igdb-option-${active}` : undefined
            }
            onChange={(event) => {
              controller.current?.abort();
              setQuery(event.target.value);
              setResults([]);
              setSearched(false);
              setError("");
              setLoading(false);
              setActive(-1);
            }}
            onCompositionStart={() => {
              controller.current?.abort();
              setComposing(true);
            }}
            onCompositionEnd={() => setComposing(false)}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                if (results.length)
                  setActive((value) =>
                    event.key === "ArrowDown"
                      ? (value + 1) % results.length
                      : value <= 0
                        ? results.length - 1
                        : value - 1,
                  );
              }
              if (event.key === "Enter") {
                event.preventDefault();
                if (active >= 0 && results[active]) pick(results[active]);
                else search();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                controller.current?.abort();
                setResults([]);
                setActive(-1);
                setLoading(false);
              }
            }}
          />
          <Button
            type="button"
            disabled={!query.trim() || composing}
            onClick={search}
          >
            Search
          </Button>
        </div>
        {create && !picker && (
          <Button
            type="button"
            variant="ghost"
            className="manual-entry"
            onClick={() => {
              controller.current?.abort();
              setLoading(false);
              onManual(query.trim());
            }}
          >
            Add manually
          </Button>
        )}
        <div className="search-results-region" aria-busy={loading}>
          <div
            className="game-search-results"
            id="igdb-results"
            role="listbox"
            aria-label="Game suggestions"
            ref={resultList}
          >
            {!loading &&
              !error &&
              results.map((game, index) => (
                <button
                  type="button"
                  role="option"
                  aria-selected={active === index}
                  id={`igdb-option-${index}`}
                  className="igdb-result"
                  key={game.id}
                  onClick={() => pick(game)}
                >
                  <GameCover
                    cover={game.cover ?? { type: "placeholder" }}
                    title={game.title}
                  />
                  <span>
                    {game.title}
                    <small>
                      {game.releaseYear ?? "Unknown release year"}
                      {game.availablePlatforms?.length
                        ? ` · ${game.availablePlatforms.map((platform) => platform.name).join(", ")}`
                        : ""}
                    </small>
                  </span>
                </button>
              ))}
          </div>
          {(loading || error || (searched && !results.length)) && (
            <div className="search-feedback">
              {feedback}
              {searched && !results.length && !loading && !error && (
                <p role="status" className="muted">
                  No games found.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
      {selected && screen !== "search" && (
        <>
          <div className="metadata-identity">
            <GameCover
              cover={selected.cover ?? { type: "placeholder" }}
              title={selected.title}
            />
            <div>
              <h3>{selected.title}</h3>
              <p className="muted">
                {selected.releaseDate ?? selected.releaseYear ?? ""}
              </p>
              {screen === "compare" && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setScreen("search");
                    setError("");
                  }}
                >
                  Find another game
                </Button>
              )}
            </div>
          </div>
          {screen === "preview" ? (
            <>
              <div className="tags">
                {selected.availablePlatforms?.map((platform) => (
                  <span key={platform.id} className="tag">
                    {platform.name}
                  </span>
                ))}
                {selected.tags?.map((tag) => (
                  <span key={tag} className="tag">
                    {tag}
                  </span>
                ))}
              </div>
              <GameMetadata game={selected} />
              <div className="dialog-actions form-actions">
                <Button
                  type="button"
                  onClick={() => {
                    if (revisiting) {
                      setScreen("compare");
                      return;
                    }
                    const choices = metadataChoices(draft, selected, "replace");
                    onApply(
                      applyMetadata(draft, selected, choices),
                      selected,
                      choices,
                    );
                  }}
                >
                  Continue
                </Button>
              </div>
            </>
          ) : (
            <MetadataComparison
              ref={comparison}
              key={selected.id}
              draft={draft}
              game={selected}
              igdbId={igdbId}
              onApply={onApply}
              onCancel={onCancel}
            />
          )}
        </>
      )}
      {screen !== "search" && feedback}
    </section>
  );
}
