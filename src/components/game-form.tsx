"use client";
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
} from "react";
import {
  statuses,
  type Game,
  type UpdateGameInput,
  createGameSchema,
} from "@/lib/game";
import { Button } from "./ui/button";
import { Select } from "./ui/select";
import { GameCover } from "./game-cover";
import { IgdbAutofill } from "./igdb-autofill";
import {
  createAutofillDraft,
  mergeIgdbTags,
  igdbPreferenceKey,
  metadataFields,
  readMetadataPreferences,
  type IgdbGame,
  type MetadataDraft,
  type MetadataField,
  type MetadataPreferences,
} from "@/lib/igdb";
import { IgdbTitleInput } from "./igdb-title-input";
import { AutofillNotice } from "./autofill-notice";
import type { Cover } from "@/lib/game";
import { TokenInput } from "./token-input";
import { Star, Upload } from "lucide-react";
export type GameFormHandle = { dismissAutofill: () => boolean };
export function GameForm({
  ref,
  game,
  platforms = [],
  tags = [],
  busy,
  onSave,
  onCancel,
}: {
  ref?: Ref<GameFormHandle>;
  game?: Game;
  platforms?: string[];
  tags?: string[];
  busy: boolean;
  onSave: (input: UpdateGameInput, image?: File) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(game?.title ?? "");
  const [releaseDate, setReleaseDate] = useState(game?.releaseDate ?? "");
  const [draftTags, setDraftTags] = useState(game?.tags ?? []);
  const [cover, setCover] = useState<Cover>(
    game?.cover ?? { type: "placeholder" },
  );
  const [coverChanged, setCoverChanged] = useState(false);
  const [metadataDraft, setMetadataDraft] = useState<MetadataDraft>();
  const searchButton = useRef<HTMLButtonElement>(null);
  const titleInput = useRef<HTMLInputElement>(null);
  const [preferences, setPreferences] = useState(() => {
    try {
      return readMetadataPreferences(localStorage.getItem(igdbPreferenceKey));
    } catch {
      return readMetadataPreferences(null);
    }
  });
  const [undo, setUndo] = useState<{
    sequence: number;
    before: MetadataDraft;
    fields: MetadataField[];
    image?: File;
    cover: Cover;
    coverChanged: boolean;
    uploadError: string;
  }>();
  const undoSequence = useRef(0);
  const clearUndo = useCallback(() => setUndo(undefined), []);
  function updatePreference(field: MetadataField, checked: boolean) {
    const next = { ...preferences, [field]: checked };
    setPreferences(next);
    try {
      localStorage.setItem(igdbPreferenceKey, JSON.stringify(next));
    } catch {}
  }
  const form = useRef<HTMLFormElement>(null);
  function backToForm() {
    setMetadataDraft(undefined);
    requestAnimationFrame(() =>
      (game ? searchButton.current : titleInput.current)?.focus(),
    );
  }
  useImperativeHandle(ref, () => ({
    dismissAutofill() {
      if (!metadataDraft) return false;
      backToForm();
      return true;
    },
  }));
  const [image, setImage] = useState<File>();
  const [uploadError, setUploadError] = useState("");
  const [dragging, setDragging] = useState(false);
  const uploadErrorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (uploadError) uploadErrorRef.current?.focus();
  }, [uploadError]);
  function selectImage(files: File[]) {
    if (busy || !files.length) return;
    const file = files[0];
    if (files.length !== 1) {
      setUploadError("Choose one image at a time.");
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setUploadError("Choose a JPEG, PNG or WebP image.");
      return;
    }
    if (!file.size || file.size > 5 * 1024 * 1024) {
      setUploadError("Choose a non-empty image up to 5 MB.");
      return;
    }
    setUploadError("");
    setError("");
    setImage(file);
    setPreview(URL.createObjectURL(file));
  }
  const [preview, setPreview] = useState<string>();
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  const [rating, setRating] = useState(game?.rating ?? 0);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [error, setError] = useState("");
  const errorSummary = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (error) {
      errorSummary.current?.focus();
      errorSummary.current?.scrollIntoView({ block: "nearest" });
    }
  }, [error]);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (metadataDraft) return;
    const data = new FormData(event.currentTarget);
    const value = (key: string) => String(data.get(key) ?? "").trim();
    const labels = (key: string) =>
      value(key)
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    const hours = value("hours"),
      minutes = value("minutes");
    const input = {
      title: value("title"),
      platforms: labels("platforms"),
      tags: labels("tags"),
      status: value("status"),
      releaseDate: value("releaseDate") || null,
      playtimeMinutes:
        hours || minutes ? Number(hours) * 60 + Number(minutes) : null,
      rating: rating || null,
      review: value("review") || null,
      cover: cover.type === "url" ? cover : { type: "placeholder" },
    };
    const parsed = createGameSchema.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues.map((issue) => issue.message).join(" "));
      return;
    }
    setError("");
    clearUndo();
    const savedInput: UpdateGameInput = { ...parsed.data };
    if (game && !image && !coverChanged) delete savedInput.cover;
    await onSave(savedInput, image);
  }
  function currentMetadata(): MetadataDraft {
    const data = new FormData(form.current!);
    return {
      title,
      releaseDate,
      tags: String(data.get("tags") ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
      cover: preview ? { type: "upload", url: preview } : cover,
    };
  }
  function applyMetadata(proposal: IgdbGame, choices: MetadataPreferences) {
    if (choices.title) setTitle(proposal.title);
    if (choices.releaseDate && proposal.releaseDate)
      setReleaseDate(proposal.releaseDate);
    if (choices.tags && proposal.tags)
      setDraftTags(mergeIgdbTags(currentMetadata().tags, proposal.tags));
    if (choices.cover && proposal.cover) {
      setCover(proposal.cover);
      setCoverChanged(true);
      setImage(undefined);
      setPreview(undefined);
      setUploadError("");
    }
    setError("");
  }
  function applyCreate(proposal: IgdbGame) {
    const before = currentMetadata();
    const result = createAutofillDraft(before, proposal, preferences);
    // A later selection supersedes the prior Undo, even when no fields change.
    clearUndo();
    if (!result.changed.length) return;
    setUndo({
      sequence: ++undoSequence.current,
      before,
      fields: result.changed,
      image,
      cover,
      coverChanged,
      uploadError,
    });
    setTitle(result.draft.title);
    setReleaseDate(result.draft.releaseDate);
    setDraftTags(result.draft.tags);
    if (result.changed.includes("cover")) {
      setCover(result.draft.cover);
      setCoverChanged(true);
    }
    setError("");
  }
  function restoreAutofill() {
    if (!undo) return;
    if (undo.fields.includes("title")) setTitle(undo.before.title);
    if (undo.fields.includes("releaseDate"))
      setReleaseDate(undo.before.releaseDate);
    if (undo.fields.includes("tags")) setDraftTags(undo.before.tags);
    if (undo.fields.includes("cover")) {
      setCover(undo.cover);
      setCoverChanged(undo.coverChanged);
      setImage(undo.image);
      setPreview(undo.image ? URL.createObjectURL(undo.image) : undefined);
      setUploadError(undo.uploadError);
    }
    clearUndo();
    requestAnimationFrame(() => titleInput.current?.focus());
  }
  const hasCover = !!image || cover.type !== "placeholder";
  return (
    <form ref={form} onSubmit={submit} className="game-form">
      {metadataDraft && (
        <IgdbAutofill
          draft={metadataDraft}
          onBack={backToForm}
          onApply={(proposal, choices) => {
            if (game) applyMetadata(proposal, choices);
            else applyCreate(proposal);
            backToForm();
          }}
        />
      )}
      <div className="form-fields" hidden={!!metadataDraft}>
        <fieldset disabled={busy}>
          <div className="igdb-entry">
            {!game && (
              <details className="igdb-preferences">
                <summary>Autofill fields</summary>
                <div className="igdb-preference-options">
                  {metadataFields.map((field) => (
                    <label className="igdb-checkbox" key={field}>
                      <input
                        type="checkbox"
                        aria-label={`Autofill ${field === "releaseDate" ? "release date" : field === "tags" ? "genres" : field}`}
                        checked={preferences[field]}
                        onChange={(event) =>
                          updatePreference(field, event.target.checked)
                        }
                      />
                      {
                        {
                          title: "Title",
                          releaseDate: "Release date",
                          cover: "Cover",
                          tags: "Genres (Tags)",
                        }[field]
                      }
                    </label>
                  ))}
                </div>
              </details>
            )}
          </div>
          <div className="form-overview">
            <section className="cover-section" aria-labelledby="cover-heading">
              <h3 id="cover-heading" className="field-label">
                Cover image
              </h3>
              <div className="cover-editor">
                <label
                  className={`form-cover-preview cover-dropzone${dragging ? " is-dragging" : ""}`}
                  onDragOver={(event) => {
                    event.preventDefault();
                    if (!busy) setDragging(true);
                  }}
                  onDragLeave={(event) => {
                    if (
                      !event.currentTarget.contains(
                        event.relatedTarget as Node | null,
                      )
                    )
                      setDragging(false);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    setDragging(false);
                    selectImage(Array.from(event.dataTransfer.files));
                  }}
                >
                  <GameCover
                    cover={preview ? { type: "upload", url: preview } : cover}
                    title={title || "Game"}
                  />
                  <span className="cover-preview-action">
                    <Upload size={14} aria-hidden="true" />
                    {dragging
                      ? "Drop image"
                      : hasCover
                        ? "Change image"
                        : "Upload image"}
                  </span>
                  <input
                    type="file"
                    aria-label="Upload cover image"
                    aria-invalid={!!uploadError}
                    aria-errormessage={
                      uploadError ? "cover-upload-error" : undefined
                    }
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(event) => {
                      selectImage(Array.from(event.target.files ?? []));
                      event.target.value = "";
                    }}
                  />
                </label>
              </div>
              {uploadError && (
                <p
                  id="cover-upload-error"
                  className="cover-upload-error"
                  role="alert"
                  tabIndex={-1}
                  ref={uploadErrorRef}
                >
                  {uploadError}
                </p>
              )}
            </section>
            <div className="form-identity">
              {game ? (
                <div className="edit-title-field">
                  <div className="title-label-row">
                    <label htmlFor="edit-game-title">
                      Title <span aria-hidden="true">*</span>
                    </label>
                    <Button
                      ref={searchButton}
                      type="button"
                      variant="ghost"
                      className="title-autofill"
                      onClick={() => setMetadataDraft(currentMetadata())}
                    >
                      Autofill
                    </Button>
                  </div>
                  <input
                    id="edit-game-title"
                    ref={titleInput}
                    name="title"
                    aria-label="Title"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    required
                    maxLength={160}
                    placeholder="Game title"
                    autoFocus
                  />
                </div>
              ) : (
                <IgdbTitleInput
                  value={title}
                  onValueChange={setTitle}
                  onSelect={applyCreate}
                  disabled={busy || !!metadataDraft}
                  inputRef={titleInput}
                />
              )}
              <label>
                Status
                <Select
                  name="status"
                  label="Status"
                  defaultValue={game?.status ?? "Unplayed"}
                  disabled={busy}
                  options={statuses.map((status) => ({
                    value: status,
                    label: status,
                  }))}
                />
              </label>
            </div>
          </div>
          <div className="form-pair">
            <TokenInput
              name="platforms"
              label="Platforms"
              initial={game?.platforms}
              suggestions={platforms}
              disabled={busy}
              chips
            />
            <TokenInput
              name="tags"
              label="Tags"
              value={draftTags}
              onValueChange={setDraftTags}
              suggestions={tags}
              disabled={busy}
            />
          </div>
          <div className="form-pair">
            <label>
              Release date
              <input
                name="releaseDate"
                type="date"
                value={releaseDate}
                onChange={(event) => setReleaseDate(event.target.value)}
              />
            </label>
            <div className="playtime-field">
              <div>
                <span className="field-label">Playtime</span>
                <div className="playtime-inputs">
                  <label>
                    <input
                      aria-label="Playtime hours"
                      name="hours"
                      type="number"
                      min="0"
                      step="1"
                      defaultValue={
                        game?.playtimeMinutes === undefined
                          ? ""
                          : Math.floor(game.playtimeMinutes / 60)
                      }
                      placeholder="0"
                    />
                    <small aria-hidden="true">h</small>
                  </label>
                  <label>
                    <input
                      aria-label="Playtime minutes"
                      name="minutes"
                      type="number"
                      min="0"
                      max="59"
                      step="1"
                      defaultValue={
                        game?.playtimeMinutes === undefined
                          ? ""
                          : game.playtimeMinutes % 60
                      }
                      placeholder="0"
                    />
                    <small aria-hidden="true">m</small>
                  </label>
                </div>
              </div>
            </div>
          </div>
          <div className="form-rating">
            <div className="rating-field-heading">
              <span className="field-label" id="form-rating-label">
                Rating
              </span>
              <span className="muted">
                {rating ? `${rating} / 10` : "Not rated"}
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
                    (hoverRating ?? rating) >= value
                      ? "star-choice is-filled"
                      : "star-choice"
                  }
                  onMouseEnter={() => setHoverRating(value)}
                >
                  <input
                    type="radio"
                    name="rating"
                    value={value}
                    checked={rating === value}
                    onChange={() => setRating(value)}
                    aria-label={`${value} out of 10`}
                  />
                  <Star
                    size={22}
                    aria-hidden="true"
                    fill={
                      (hoverRating ?? rating) >= value ? "currentColor" : "none"
                    }
                  />
                </label>
              ))}
            </div>
            <button
              type="button"
              className="clear-rating"
              disabled={!rating}
              onClick={() => setRating(0)}
            >
              Clear rating
            </button>
          </div>
          <label>
            Review
            <textarea
              name="review"
              defaultValue={game?.review}
              rows={3}
              maxLength={10000}
              placeholder="Your notes about the game"
            />
          </label>
          {error && (
            <p
              ref={errorSummary}
              tabIndex={-1}
              role="alert"
              className="error-message"
            >
              {error}
            </p>
          )}
        </fieldset>
      </div>
      {!busy && undo && (
        <AutofillNotice
          key={undo.sequence}
          count={undo.fields.length}
          onUndo={restoreAutofill}
          onExpire={clearUndo}
        />
      )}
      <div className="dialog-actions form-actions" hidden={!!metadataDraft}>
        <Button
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy
            ? image
              ? "Uploading and saving…"
              : "Saving…"
            : game
              ? "Save changes"
              : "Create game"}
        </Button>
      </div>
    </form>
  );
}
