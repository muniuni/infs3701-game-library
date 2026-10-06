"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import {
  igdbGameSchema,
  igdbPreferenceKey,
  metadataFields,
  metadataChoices,
  editAutofillProposal,
  metadataChanged,
  readMetadataPreferences,
  type IgdbGame,
  type MetadataDraft,
  type MetadataPreferences,
  type MetadataField,
} from "@/lib/igdb";
import { Button } from "./ui/button";
import { GameCover } from "./game-cover";
const labels: Record<MetadataField, string> = {
  title: "Title",
  releaseDate: "Release date",
  cover: "Cover",
  tags: "Genres (Tags)",
};
export function IgdbAutofill({
  draft,
  onApply,
  onBack,
}: {
  draft: MetadataDraft;
  onApply: (proposal: IgdbGame, choices: MetadataPreferences) => void;
  onBack: () => void;
}) {
  const [query, setQuery] = useState(draft.title);
  const [results, setResults] = useState<IgdbGame[] | null>(null);
  const [selected, setSelected] = useState<IgdbGame>();
  const [choices, setChoices] = useState<MetadataPreferences>(() =>
    readMetadataPreferences(null),
  );
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, [selected]);
  useEffect(() => () => controller.current?.abort(), []);
  const load = useCallback(
    async (id?: number) => {
      controller.current?.abort();
      const active = new AbortController();
      controller.current = active;
      setLoading(true);
      setError("");
      try {
        const response = await fetch(
          id
            ? `/api/igdb/games/${id}`
            : `/api/igdb/search?q=${encodeURIComponent(query.trim())}`,
          { cache: "no-store", signal: active.signal },
        );
        const body = await response.json();
        if (!response.ok)
          throw new Error(
            typeof body.error === "string"
              ? body.error
              : "IGDB search failed. Please try again.",
          );
        if (active.signal.aborted) return;
        if (id) {
          const proposal = editAutofillProposal(
            draft,
            igdbGameSchema.parse(body),
          );
          setChoices(metadataChoices(draft, proposal));
          setSelected(proposal);
        } else setResults(z.array(igdbGameSchema).max(20).parse(body));
      } catch (err) {
        if (!active.signal.aborted)
          setError(
            err instanceof z.ZodError
              ? "IGDB returned invalid metadata. Please try again."
              : err instanceof Error
                ? err.message
                : "IGDB search failed. Please try again.",
          );
      } finally {
        if (!active.signal.aborted) setLoading(false);
      }
    },
    [query, draft],
  );
  const firstSearch = useRef(true);
  useEffect(() => {
    if (selected || !query.trim()) return;
    const timer = window.setTimeout(
      () => void load(),
      firstSearch.current ? 0 : 300,
    );
    firstSearch.current = false;
    return () => {
      window.clearTimeout(timer);
      controller.current?.abort();
    };
  }, [query, selected, load]);
  function toggle(field: MetadataField, checked: boolean) {
    setChoices((previous) => ({ ...previous, [field]: checked }));
    try {
      const preferences = readMetadataPreferences(
        localStorage.getItem(igdbPreferenceKey),
      );
      localStorage.setItem(
        igdbPreferenceKey,
        JSON.stringify({ ...preferences, [field]: checked }),
      );
    } catch {}
  }
  return (
    <section className="igdb-panel" aria-label="IGDB autofill">
      <div className="form-fields">
        <h3 tabIndex={-1} ref={heading}>
          {selected ? "Choose fields to apply" : "Search IGDB"}
        </h3>
        {!selected ? (
          <>
            <div className="igdb-search">
              <label>
                IGDB game title
                <input
                  value={query}
                  maxLength={160}
                  onChange={(event) => {
                    controller.current?.abort();
                    setLoading(false);
                    setQuery(event.target.value);
                    setResults(null);
                    setError("");
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      if (query.trim() && !loading) void load();
                    }
                  }}
                />
              </label>
            </div>
            <p className="muted">
              Title, release date, cover and genres. You choose what to apply.
            </p>
            {results && !results.length && (
              <p role="status">
                No IGDB games found. Try another title or continue manually.
              </p>
            )}
            <div className="igdb-results">
              {results?.map((game) => (
                <button
                  type="button"
                  className="igdb-result"
                  key={game.id}
                  disabled={loading}
                  onClick={() => {
                    void load(game.id);
                  }}
                >
                  <GameCover
                    cover={game.cover ?? { type: "placeholder" }}
                    title={game.title}
                  />
                  <span>
                    {game.title}
                    <small>
                      {game.releaseYear ?? "Release year not available"}
                    </small>
                  </span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <p className="muted">
              {selected.title}. Changes stay in the form until you save.
            </p>
            {!metadataFields.some((field) =>
              metadataChanged(draft, selected, field),
            ) && <p role="status">No changes available for this game.</p>}
            <div className="igdb-comparisons">
              {metadataFields.map((field) => {
                const available = metadataChanged(draft, selected, field);
                if (!available) return null;
                return (
                  <div className="igdb-field" key={field}>
                    <label className="igdb-checkbox">
                      <input
                        type="checkbox"
                        checked={available && choices[field]}
                        disabled={!available}
                        onChange={(event) =>
                          toggle(field, event.target.checked)
                        }
                      />
                      {labels[field]}
                    </label>
                    {field === "cover" ? (
                      <div className="igdb-values igdb-covers">
                        <div>
                          <small>Current</small>
                          <GameCover cover={draft.cover} title="Current" />
                        </div>
                        <div>
                          <small>Proposed</small>
                          {selected.cover ? (
                            <GameCover
                              cover={selected.cover}
                              title="Proposed"
                            />
                          ) : (
                            <p>Not available</p>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="igdb-values">
                        <div>
                          <small>Current</small>
                          <p>
                            {field === "tags"
                              ? draft.tags.join(", ") || "Not set"
                              : draft[field] || "Not set"}
                          </p>
                        </div>
                        <div>
                          <small>Proposed</small>
                          <p>
                            {field === "tags"
                              ? selected.tags?.join(", ") || "Not available"
                              : selected[field] || "Not available"}
                          </p>
                        </div>
                      </div>
                    )}
                    {!available && (
                      <small className="muted">
                        {selected[field] === undefined ||
                        (Array.isArray(selected[field]) &&
                          !selected[field]?.length)
                          ? "No value supplied by IGDB"
                          : "Already matches"}
                      </small>
                    )}
                    {field === "tags" && available && draft.tags.length > 0 && (
                      <small className="muted">
                        New genres are added to your existing tags.
                      </small>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
        {loading && (
          <p role="status">
            {results ? "Loading IGDB metadata…" : "Searching IGDB…"}
          </p>
        )}
        {error && (
          <p role="alert" className="error-message">
            {error}
          </p>
        )}
      </div>
      <div className="dialog-actions form-actions">
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            controller.current?.abort();
            setLoading(false);
            setError("");
            if (selected) setSelected(undefined);
            else onBack();
          }}
        >
          {selected ? "Back to results" : "Back to form"}
        </Button>
        {selected && (
          <Button
            type="button"
            disabled={
              loading ||
              !metadataFields.some(
                (field) =>
                  choices[field] && metadataChanged(draft, selected, field),
              )
            }
            onClick={() => onApply(selected, choices)}
          >
            Apply selected
          </Button>
        )}
      </div>
    </section>
  );
}
