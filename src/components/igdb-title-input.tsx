"use client";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type RefObject,
} from "react";
import { Popover } from "radix-ui";
import { z } from "zod";
import { igdbGameSchema, type IgdbGame } from "@/lib/igdb";
import { GameCover } from "./game-cover";

export function IgdbTitleInput({
  value,
  onValueChange,
  onSelect,
  disabled,
  inputRef,
}: {
  value: string;
  onValueChange: (value: string) => void;
  onSelect: (game: IgdbGame) => void;
  disabled: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
}) {
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(
    null,
  );
  const anchorRef = useCallback((node: HTMLDivElement | null) => {
    setPortalContainer(node?.closest<HTMLElement>('[role="dialog"]') ?? null);
  }, []);
  const id = useId();
  const listId = `${id}-results`;
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<IgdbGame[]>([]);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [composing, setComposing] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const content = useRef<HTMLDivElement>(null);
  const show = open && !disabled && query.trim().length >= 3 && !composing;
  useEffect(() => {
    controller.current?.abort();
    if (!show) return;
    const request = new AbortController();
    controller.current = request;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(
          `/api/igdb/search?q=${encodeURIComponent(query.trim())}`,
          { cache: "no-store", signal: request.signal },
        );
        const body = await response.json();
        if (!response.ok)
          throw new Error(
            typeof body.error === "string"
              ? body.error
              : "Game search is unavailable. Continue manually.",
          );
        const games = z.array(igdbGameSchema).max(20).parse(body);
        if (request.signal.aborted) return;
        setResults(games);
        setActive(-1);
        setMessage(
          games.length
            ? ""
            : "No games found. Try another title or continue manually.",
        );
      } catch {
        if (!request.signal.aborted) {
          setResults([]);
          setMessage("Game suggestions are unavailable. Continue manually.");
        }
      } finally {
        if (!request.signal.aborted) setLoading(false);
      }
    }, 300);
    return () => {
      window.clearTimeout(timer);
      request.abort();
    };
  }, [query, show]);
  useEffect(() => {
    content.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);
  function dismiss() {
    controller.current?.abort();
    setOpen(false);
    setQuery("");
    setActive(-1);
    setLoading(false);
  }
  function select(game: IgdbGame) {
    dismiss();
    onSelect(game);
    inputRef.current?.focus();
  }
  return (
    <div className="igdb-title-field" ref={anchorRef}>
      <Popover.Root
        open={show}
        onOpenChange={(next) => {
          if (!next) dismiss();
        }}
      >
        <Popover.Anchor asChild>
          <label htmlFor={id}>
            Title <span aria-hidden="true">*</span>
            <input
              id={id}
              ref={inputRef}
              name="title"
              aria-label="Title"
              value={value}
              required
              maxLength={160}
              placeholder="Game title"
              autoFocus
              disabled={disabled}
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={show}
              aria-controls={show ? listId : undefined}
              aria-activedescendant={
                show && active >= 0 ? `${listId}-${active}` : undefined
              }
              autoComplete="off"
              onChange={(event) => {
                controller.current?.abort();
                onValueChange(event.target.value);
                setQuery(event.target.value);
                setResults([]);
                setActive(-1);
                setMessage("");
                setLoading(event.target.value.trim().length >= 3);
                setOpen(true);
              }}
              onCompositionStart={() => {
                controller.current?.abort();
                setComposing(true);
              }}
              onCompositionEnd={(event) => {
                setComposing(false);
                setQuery(event.currentTarget.value);
              }}
              onBlur={(event) => {
                if (!content.current?.contains(event.relatedTarget)) dismiss();
              }}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing) return;
                if (
                  show &&
                  ["ArrowDown", "ArrowUp"].includes(event.key) &&
                  results.length
                ) {
                  event.preventDefault();
                  setActive((previous) =>
                    event.key === "ArrowDown"
                      ? (previous + 1) % results.length
                      : previous <= 0
                        ? results.length - 1
                        : previous - 1,
                  );
                } else if (show && event.key === "Enter" && active >= 0) {
                  event.preventDefault();
                  select(results[active]);
                } else if (show && event.key === "Escape") {
                  event.preventDefault();
                  event.stopPropagation();
                  dismiss();
                } else if (event.key === "Tab") dismiss();
                else if (show && event.key === "Enter") {
                  event.preventDefault();
                  dismiss();
                }
              }}
            />
          </label>
        </Popover.Anchor>
        <Popover.Portal container={portalContainer}>
          <Popover.Content
            ref={content}
            className="igdb-suggestions"
            side="bottom"
            align="start"
            sideOffset={6}
            collisionPadding={12}
            onOpenAutoFocus={(event) => event.preventDefault()}
            onCloseAutoFocus={(event) => event.preventDefault()}
            onInteractOutside={(event) => {
              if (
                event.target instanceof Node &&
                inputRef.current?.contains(event.target)
              )
                event.preventDefault();
            }}
          >
            <div
              id={listId}
              role="listbox"
              aria-label="Game suggestions"
              className="igdb-suggestion-list"
            >
              {results.map((game, index) => (
                <div
                  key={game.id}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={active === index}
                  className="igdb-suggestion"
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => select(game)}
                >
                  <GameCover
                    cover={game.cover ?? { type: "placeholder" }}
                    title={game.title}
                  />
                  <div>
                    {game.title}
                    <small>
                      {game.releaseYear ?? "Release year not available"}
                    </small>
                  </div>
                </div>
              ))}
            </div>
            {(loading || message) && (
              <p role="status" className="igdb-suggestion-status">
                {loading ? "Searching games…" : message}
              </p>
            )}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}
