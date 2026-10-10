"use client";
import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
} from "react";
import { ChevronLeft, Star, Upload } from "lucide-react";
import {
  statuses,
  createGameSchema,
  type Game,
  type Cover,
  type UpdateGameInput,
} from "@/lib/game";
import {
  metadataFields,
  metadataLabels,
  type MetadataDraft,
  type IgdbGame,
  type MetadataChoices,
} from "@/lib/igdb";
import { Button } from "./ui/button";
import { Select } from "./ui/select";
import { GameCover } from "./game-cover";
import { TokenInput } from "./token-input";
import { IgdbAutofill } from "./igdb-autofill";
import { ScreenshotGallery } from "./game-metadata";

type Draft = MetadataDraft & {
  igdbId?: number;
  availablePlatforms: { id: number; name: string }[];
  platforms: string[];
  status: Game["status"];
  hours: string;
  minutes: string;
  rating: number;
  review: string;
};
function initialDraft(game?: Game): Draft {
  return {
    title: game?.title ?? "",
    releaseDate: game?.releaseDate ?? "",
    cover: game?.cover ?? { type: "placeholder" },
    tags: game?.tags ?? [],
    developers: game?.developers ?? [],
    publishers: game?.publishers ?? [],
    summary: game?.summary ?? "",
    storyline: game?.storyline ?? "",
    screenshots: game?.screenshots ?? [],
    igdbId: game?.igdbId,
    availablePlatforms: game?.availablePlatforms ?? [],
    platforms: game?.platforms ?? [],
    status: game?.status ?? "Unplayed",
    hours:
      game?.playtimeMinutes === undefined
        ? ""
        : String(Math.floor(game.playtimeMinutes / 60)),
    minutes:
      game?.playtimeMinutes === undefined
        ? ""
        : String(game.playtimeMinutes % 60),
    rating: game?.rating ?? 0,
    review: game?.review ?? "",
  };
}
export type GameFormHandle = {
  dismiss: () => void;
  saveAndClose: () => void;
  focus: () => void;
};
export function GameForm({
  ref,
  game,
  platforms = [],
  tags = [],
  busy,
  onSave,
  onDismiss,
  onRequestConfirmation,
}: {
  ref?: Ref<GameFormHandle>;
  game?: Game;
  platforms?: string[];
  tags?: string[];
  busy: boolean;
  onSave: (
    input: UpdateGameInput,
    image?: File,
    dismiss?: boolean,
  ) => Promise<void>;
  onDismiss: () => void;
  onRequestConfirmation: () => void;
}) {
  const [draft, setDraft] = useState(() => initialDraft(game));
  const [baseline] = useState(() => JSON.stringify(initialDraft(game)));
  const [companyText, setCompanyText] = useState(() => ({
    developers: (game?.developers ?? []).join(", "),
    publishers: (game?.publishers ?? []).join(", "),
  }));
  const [panel, setPanel] = useState(!game);
  const [visited, setVisited] = useState(false);
  const [session, setSession] = useState(0);
  const [image, setImage] = useState<File>();
  const [preview, setPreview] = useState<string>();
  const [error, setError] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const titleInput = useRef<HTMLInputElement>(null);
  const updateButton = useRef<HTMLButtonElement>(null);
  const workflow = useRef<import("./igdb-autofill").AutofillHandle>(null);
  async function persist(draft: Draft, dismiss = false, replaceCover = false) {
    if (busy) return;
    if (!panel && form.current && !form.current.reportValidity()) return;
    const data =
      !panel && form.current ? new FormData(form.current) : new FormData();
    const tokens = (field: string, fallback: string[]) =>
      data.has(field)
        ? String(data.get(field))
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean)
        : fallback;
    const input = {
      ...draft,
      tags: tokens("tags", draft.tags),
      platforms: tokens("platforms", draft.platforms),
      developers: draft.developers,
      publishers: draft.publishers,
      hours: undefined,
      minutes: undefined,
      releaseDate: draft.releaseDate || null,
      summary: draft.summary || null,
      storyline: draft.storyline || null,
      rating: draft.rating || null,
      review: draft.review || null,
      playtimeMinutes:
        draft.hours || draft.minutes
          ? Number(draft.hours) * 60 + Number(draft.minutes)
          : null,
      cover: draft.cover.type === "url" ? draft.cover : { type: "placeholder" },
    };
    const { hours, minutes, ...values } = input;
    void hours;
    void minutes;
    const parsed = createGameSchema.safeParse(values);
    if (!parsed.success) {
      setError(
        parsed.error.issues
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join(" "),
      );
      return;
    }
    setError("");
    const saved: UpdateGameInput = { ...parsed.data };
    if (
      game &&
      !image &&
      JSON.stringify(draft.cover) === JSON.stringify(game.cover)
    )
      delete saved.cover;
    await onSave(saved, replaceCover ? undefined : image, dismiss);
  }
  function close() {
    dismiss();
  }
  function saveAndClose() {
    if (busy) return;
    if (panel) {
      const pending = workflow.current?.pending();
      if (!pending) {
        setPanel(false);
        void persist(draft, true);
        return;
      }
      const next = {
        ...draft,
        ...pending.draft,
        ...(pending.game
          ? {
              igdbId: pending.game.id,
              availablePlatforms: pending.game.availablePlatforms ?? [],
            }
          : {}),
      };
      if (pending.replaceCover) {
        setImage(undefined);
        setPreview(undefined);
        setUploadError("");
      }
      setCompanyText({
        developers: next.developers.join(", "),
        publishers: next.publishers.join(", "),
      });
      setDraft(next);
      setPanel(false);
      void persist(next, true, pending.replaceCover);
    } else void persist(draft, true);
  }
  function dismiss() {
    if (busy) return;
    const pending = panel ? workflow.current?.pending() : undefined;
    const candidate = pending
      ? {
          ...draft,
          ...pending.draft,
          ...(pending.game
            ? {
                igdbId: pending.game.id,
                availablePlatforms:
                  pending.game.availablePlatforms ?? draft.availablePlatforms,
              }
            : {}),
        }
      : draft;
    const dirty =
      !!image ||
      JSON.stringify(candidate) !== baseline ||
      (panel && workflow.current?.hasSearchChanges());
    if (dirty) onRequestConfirmation();
    else onDismiss();
  }
  useImperativeHandle(ref, () => ({
    dismiss,
    saveAndClose,
    focus: () => {
      if (panel) workflow.current?.focus();
      else titleInput.current?.focus();
    },
  }));
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  useEffect(() => {
    if (error || uploadError) {
      errorRef.current?.focus();
      errorRef.current?.scrollIntoView({ block: "nearest" });
    }
  }, [error, uploadError]);
  function patch<K extends keyof Draft>(field: K, value: Draft[K]) {
    setDraft((previous) => ({ ...previous, [field]: value }));
  }
  function returnToForm() {
    setPanel(false);
    requestAnimationFrame(() =>
      (game ? updateButton.current : titleInput.current)?.focus(),
    );
  }
  function selectImage(files: File[]) {
    if (busy || !files.length) return;
    const file = files[0];
    if (
      files.length !== 1 ||
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      !file.size ||
      file.size > 5 * 1024 * 1024
    ) {
      setUploadError("Choose one JPEG, PNG or WebP image up to 5 MB.");
      return;
    }
    setUploadError("");
    setImage(file);
    setPreview(URL.createObjectURL(file));
  }
  function apply(
    next: MetadataDraft,
    selected: IgdbGame,
    choices: MetadataChoices,
  ) {
    if (choices.cover) {
      setImage(undefined);
      setPreview(undefined);
      setUploadError("");
    }
    setCompanyText({
      developers: next.developers.join(", "),
      publishers: next.publishers.join(", "),
    });
    setDraft((previous) => ({
      ...previous,
      ...next,
      igdbId: selected.id,
      availablePlatforms:
        selected.availablePlatforms ??
        (previous.igdbId === selected.id ? previous.availablePlatforms : []),
    }));
    setError("");
    setVisited(true);
    returnToForm();
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (panel || busy) return;
    await persist(draft);
  }
  const displayedCover: Cover = preview
    ? { type: "upload", url: preview }
    : draft.cover;
  function renderFields(fields: readonly (typeof metadataFields)[number][]) {
    return (
      <div className="metadata-form-grid">
        {fields.map((field) => (
          <div className={`metadata-input metadata-input-${field}`} key={field}>
            {field === "cover" ? (
              <section className="cover-section" aria-label="Cover image">
                <h3 className="field-label">Cover image</h3>
                <label
                  className={`form-cover-preview cover-dropzone${dragging ? " is-dragging" : ""}`}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(event) => {
                    event.preventDefault();
                    setDragging(false);
                    selectImage(Array.from(event.dataTransfer.files));
                  }}
                >
                  <GameCover
                    cover={displayedCover}
                    title={draft.title || "Game"}
                  />
                  <span className="cover-preview-action">
                    <Upload size={14} />
                    {image || draft.cover.type !== "placeholder"
                      ? "Change image"
                      : "Upload image"}
                  </span>
                  <input
                    type="file"
                    aria-label="Upload cover image"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(event) => {
                      selectImage(Array.from(event.target.files ?? []));
                      event.target.value = "";
                    }}
                  />
                </label>
              </section>
            ) : field === "developers" || field === "publishers" ? (
              <label>
                {metadataLabels[field]}
                <input
                  name={field}
                  value={companyText[field]}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setCompanyText((previous) => ({
                      ...previous,
                      [field]: value,
                    }));
                    patch(
                      field,
                      value
                        .split(",")
                        .map((value) => value.trim())
                        .filter(Boolean),
                    );
                  }}
                />
              </label>
            ) : field === "tags" ? (
              <TokenInput
                name={field}
                label={metadataLabels[field]}
                value={draft[field]}
                onValueChange={(value) => patch(field, value)}
                suggestions={field === "tags" ? tags : []}
                disabled={busy}
              />
            ) : field === "screenshots" ? (
              <section>
                <h3 className="field-label">Screenshots</h3>
                {draft.screenshots.length ? (
                  <ScreenshotGallery
                    images={draft.screenshots}
                    onChange={(value) => patch("screenshots", value)}
                  />
                ) : (
                  <p className="muted">No screenshots</p>
                )}
              </section>
            ) : field === "summary" || field === "storyline" ? (
              <label>
                {metadataLabels[field]}
                <textarea
                  aria-label={metadataLabels[field]}
                  name={field}
                  rows={3}
                  maxLength={20000}
                  value={draft[field]}
                  onChange={(event) => patch(field, event.target.value)}
                />
              </label>
            ) : (
              <label>
                {metadataLabels[field]}
                {field === "title" ? (
                  <input
                    ref={titleInput}
                    name="title"
                    required
                    maxLength={160}
                    value={draft.title}
                    onChange={(event) => patch("title", event.target.value)}
                  />
                ) : (
                  <input
                    name="releaseDate"
                    type="date"
                    value={draft.releaseDate}
                    onChange={(event) =>
                      patch("releaseDate", event.target.value)
                    }
                  />
                )}
              </label>
            )}
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="game-form-shell">
      {(!game || panel) && (
        <div hidden={!panel}>
          <IgdbAutofill
            ref={workflow}
            key={game ? session : "create"}
            active={panel}
            draft={{ ...draft, cover: displayedCover }}
            igdbId={draft.igdbId}
            create={!game}
            revisiting={visited}
            onApply={apply}
            onManual={(title) => {
              if (!visited) patch("title", title);
              setVisited(true);
              returnToForm();
            }}
            onCancel={dismiss}
            onBack={() => {
              if (game || visited) returnToForm();
              else close();
            }}
          />
        </div>
      )}
      <form ref={form} onSubmit={submit} className="game-form" hidden={panel}>
        <div className="workflow-heading">
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              if (game) dismiss();
              else setPanel(true);
            }}
          >
            <ChevronLeft size={16} />
            Back
          </Button>
          {game && (
            <Button
              ref={updateButton}
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => {
                setSession((value) => value + 1);
                setPanel(true);
              }}
            >
              Update metadata
            </Button>
          )}
        </div>
        <div className="form-fields">
          <fieldset disabled={busy}>
            <div className="form-hero">
              {renderFields(["cover"])}
              <div className="form-hero-inputs">
                {renderFields(["title"])}
                <label>
                  Status
                  <Select
                    name="status"
                    label="Status"
                    value={draft.status}
                    onValueChange={(value) =>
                      patch("status", value as Game["status"])
                    }
                    disabled={busy}
                    options={statuses.map((status) => ({
                      value: status,
                      label: status,
                    }))}
                  />
                </label>

                {draft.availablePlatforms.length > 0 ? (
                  <div>
                    <span className="field-label" id="platform-choice-label">
                      Platforms
                    </span>
                    <div
                      className="platform-choices"
                      role="group"
                      aria-labelledby="platform-choice-label"
                    >
                      {[
                        ...new Set([
                          ...draft.availablePlatforms.map(
                            (platform) => platform.name,
                          ),
                          ...draft.platforms,
                        ]),
                      ].map((name) => (
                        <button
                          type="button"
                          aria-pressed={draft.platforms.includes(name)}
                          key={name}
                          onClick={() =>
                            patch(
                              "platforms",
                              draft.platforms.includes(name)
                                ? draft.platforms.filter(
                                    (platform) => platform !== name,
                                  )
                                : [...draft.platforms, name],
                            )
                          }
                        >
                          {name}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <TokenInput
                    name="platforms"
                    label="Platforms"
                    value={draft.platforms}
                    onValueChange={(value) => patch("platforms", value)}
                    suggestions={platforms}
                    chips
                    disabled={busy}
                  />
                )}
              </div>
            </div>
            <div className="personal-fields">
              <div className="form-pair">
                <div className="playtime-field">
                  <span className="field-label">Playtime</span>
                  <div className="playtime-inputs">
                    <label>
                      <input
                        aria-label="Playtime hours"
                        name="hours"
                        type="number"
                        min="0"
                        step="1"
                        value={draft.hours}
                        onChange={(event) => patch("hours", event.target.value)}
                        placeholder="0"
                      />
                      <small>h</small>
                    </label>
                    <label>
                      <input
                        aria-label="Playtime minutes"
                        name="minutes"
                        type="number"
                        min="0"
                        max="59"
                        step="1"
                        value={draft.minutes}
                        onChange={(event) =>
                          patch("minutes", event.target.value)
                        }
                        placeholder="0"
                      />
                      <small>m</small>
                    </label>
                  </div>
                </div>
              </div>
              <div className="form-rating">
                <div className="rating-field-heading">
                  <span className="field-label" id="form-rating-label">
                    Rating
                  </span>
                  <span className="muted">
                    {draft.rating ? `${draft.rating} / 10` : "Not rated"}
                  </span>
                </div>
                <div
                  className="star-input"
                  role="radiogroup"
                  aria-labelledby="form-rating-label"
                  onMouseLeave={() => setHoverRating(null)}
                >
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((value) => (
                    <label
                      key={value}
                      className={
                        (hoverRating ?? draft.rating) >= value
                          ? "star-choice is-filled"
                          : "star-choice"
                      }
                      onMouseEnter={() => setHoverRating(value)}
                    >
                      <input
                        type="radio"
                        name="rating"
                        value={value}
                        checked={draft.rating === value}
                        onChange={() => patch("rating", value)}
                        aria-label={`${value} out of 10`}
                      />
                      <Star
                        size={22}
                        aria-hidden="true"
                        fill={
                          (hoverRating ?? draft.rating) >= value
                            ? "currentColor"
                            : "none"
                        }
                      />
                    </label>
                  ))}
                </div>
                <button
                  type="button"
                  className="clear-rating"
                  disabled={!draft.rating}
                  onClick={() => patch("rating", 0)}
                >
                  Clear rating
                </button>
              </div>
              <label>
                Review
                <textarea
                  aria-label="Review"
                  name="review"
                  rows={3}
                  maxLength={10000}
                  value={draft.review}
                  onChange={(event) => patch("review", event.target.value)}
                />
              </label>
              {renderFields(["tags"])}
            </div>
            {renderFields([
              "releaseDate",
              "developers",
              "publishers",
              "summary",
              "storyline",
              "screenshots",
            ])}
            {(error || uploadError) && (
              <p
                ref={errorRef}
                role="alert"
                tabIndex={-1}
                className="error-message"
              >
                {error || uploadError}
              </p>
            )}
          </fieldset>
        </div>
        <div className="dialog-actions form-actions">
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={close}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : game ? "Save changes" : "Add game"}
          </Button>
        </div>
      </form>
    </div>
  );
}
