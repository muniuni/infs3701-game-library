"use client";
import { useEffect, useRef, useState } from "react";
import {
  statuses,
  type Game,
  type CreateGameInput,
  createGameSchema,
} from "@/lib/game";
import { Button } from "./ui/button";
import { Select } from "./ui/select";
import { GameCover } from "./game-cover";
import { TokenInput } from "./token-input";
import { Pencil, Star, Image as ImageIcon, Link } from "lucide-react";
export function GameForm({
  game,
  busy,
  onSave,
  onCancel,
}: {
  game?: Game;
  busy: boolean;
  onSave: (input: CreateGameInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [coverType, setCoverType] = useState(
    game?.cover.type === "url" ? "url" : "placeholder",
  );
  const [coverUrl, setCoverUrl] = useState(
    game?.cover.type === "url" ? game.cover.url : "",
  );
  const [rating, setRating] = useState(game?.rating ?? 0);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [editingCover, setEditingCover] = useState(false);
  const [error, setError] = useState("");
  const errorSummary = useRef<HTMLParagraphElement>(null);
  const coverButton = useRef<HTMLButtonElement>(null);
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
      cover:
        coverType === "url"
          ? { type: "url", url: coverUrl.trim() }
          : { type: "placeholder" },
    };
    const parsed = createGameSchema.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues.map((issue) => issue.message).join(" "));
      return;
    }
    setError("");
    await onSave(parsed.data);
  }
  return (
    <form onSubmit={submit} className="game-form">
      <div className="form-fields">
        <fieldset disabled={busy}>
          <div className="cover-editor">
            <div className="form-cover-preview">
              <GameCover
                cover={
                  coverType === "url" && /^https?:\/\//i.test(coverUrl)
                    ? { type: "url", url: coverUrl }
                    : { type: "placeholder" }
                }
                title={game?.title || "Game"}
              />
              <button
                type="button"
                className="cover-edit-action"
                ref={coverButton}
                aria-expanded={editingCover}
                aria-controls="cover-controls"
                onClick={() => setEditingCover(!editingCover)}
              >
                <Pencil size={14} /> Edit cover
              </button>
            </div>
            {editingCover && (
              <div id="cover-controls" className="cover-controls">
                <div
                  className="cover-source-options"
                  role="group"
                  aria-label="Cover source"
                >
                  <button
                    type="button"
                    aria-pressed={coverType === "placeholder"}
                    onClick={() => setCoverType("placeholder")}
                  >
                    <ImageIcon size={15} />
                    Placeholder
                  </button>
                  <button
                    type="button"
                    aria-pressed={coverType === "url"}
                    onClick={() => setCoverType("url")}
                  >
                    <Link size={15} />
                    Image URL
                  </button>
                </div>
                {coverType === "url" && (
                  <label>
                    Cover URL
                    <input
                      type="url"
                      autoFocus
                      value={coverUrl}
                      onChange={(event) => setCoverUrl(event.target.value)}
                      placeholder="https://example.com/cover.jpg"
                    />
                  </label>
                )}
                <p className="cover-hint">
                  {coverType === "url"
                    ? "Use a direct HTTPS or HTTP image link."
                    : "Use the default cover. You can add an image URL anytime."}
                </p>
                <button
                  type="button"
                  className="cover-done"
                  onClick={() => {
                    setEditingCover(false);
                    coverButton.current?.focus();
                  }}
                >
                  Done
                </button>
              </div>
            )}
          </div>
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
            <label>
              Release date
              <input
                name="releaseDate"
                type="date"
                defaultValue={game?.releaseDate}
              />
            </label>
          </div>
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
                  <small>Hours</small>
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
                  <small>Minutes</small>
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
          {busy ? "Saving…" : game ? "Save changes" : "Create game"}
        </Button>
      </div>
    </form>
  );
}
