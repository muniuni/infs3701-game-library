"use client";
import { useEffect, useRef, useState } from "react";
import {
  statuses,
  type Game,
  type UpdateGameInput,
  createGameSchema,
} from "@/lib/game";
import { Button } from "./ui/button";
import { Select } from "./ui/select";
import { GameCover } from "./game-cover";
import { TokenInput } from "./token-input";
import { Star, Upload } from "lucide-react";
export function GameForm({
  game,
  busy,
  onSave,
  onCancel,
}: {
  game?: Game;
  busy: boolean;
  onSave: (input: UpdateGameInput, image?: File) => Promise<void>;
  onCancel: () => void;
}) {
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
      cover: { type: "placeholder" },
    };
    const parsed = createGameSchema.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues.map((issue) => issue.message).join(" "));
      return;
    }
    setError("");
    const savedInput: UpdateGameInput = { ...parsed.data };
    if (game && !image) delete savedInput.cover;
    await onSave(savedInput, image);
  }
  const hasCover = !!image || (!!game && game.cover.type !== "placeholder");
  return (
    <form onSubmit={submit} className="game-form">
      <div className="form-fields">
        <fieldset disabled={busy}>
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
                    cover={
                      preview
                        ? { type: "upload", url: preview }
                        : (game?.cover ?? { type: "placeholder" })
                    }
                    title={game?.title || "Game"}
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
              <label>
                Title <span aria-hidden="true">*</span>
                <input
                  name="title"
                  defaultValue={game?.title}
                  required
                  maxLength={160}
                  placeholder="Game title"
                  autoFocus
                />
              </label>
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
            />
            <TokenInput name="tags" label="Tags" initial={game?.tags} />
          </div>
          <div className="form-pair">
            <label>
              Release date
              <input
                name="releaseDate"
                type="date"
                defaultValue={game?.releaseDate}
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
      <div className="dialog-actions form-actions">
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
