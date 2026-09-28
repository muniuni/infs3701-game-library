"use client";
import { useState } from "react";
import {
  statuses,
  type Game,
  type CreateGameInput,
  createGameSchema,
} from "@/lib/game";
import { Button } from "./ui/button";
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
  const [error, setError] = useState("");
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
      rating: value("rating") ? Number(value("rating")) : null,
      review: value("review") || null,
      cover:
        coverType === "url"
          ? { type: "url", url: value("coverUrl") }
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
      <fieldset disabled={busy}>
        <label>
          Title <span aria-hidden="true">*</span>
          <input
            name="title"
            defaultValue={game?.title}
            required
            maxLength={160}
            placeholder="Name your next adventure"
            autoFocus
          />
        </label>
        <div className="form-pair">
          <label>
            Platforms
            <input
              name="platforms"
              aria-label="Platforms"
              aria-describedby="platforms-hint"
              defaultValue={game?.platforms.join(", ")}
              placeholder="PC, Switch"
            />
            <small id="platforms-hint">Separate platforms with commas.</small>
          </label>
          <label>
            Tags
            <input
              name="tags"
              aria-label="Tags"
              aria-describedby="tags-hint"
              defaultValue={game?.tags.join(", ")}
              placeholder="RPG, favourites"
            />
            <small id="tags-hint">
              Genres and your own tags, separated by commas.
            </small>
          </label>
        </div>
        <div className="form-pair">
          <label>
            Status
            <select name="status" defaultValue={game?.status ?? "Unplayed"}>
              {statuses.map((status) => (
                <option key={status}>{status}</option>
              ))}
            </select>
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
        <div className="form-pair">
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
          <label>
            Rating
            <select name="rating" defaultValue={game?.rating ?? ""}>
              <option value="">Not rated</option>
              {Array.from({ length: 10 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {i + 1} / 10
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Review
          <textarea
            name="review"
            defaultValue={game?.review}
            rows={3}
            maxLength={10000}
            placeholder="What stayed with you?"
          />
        </label>
        <label>
          Cover source
          <select
            value={coverType}
            onChange={(event) => setCoverType(event.target.value)}
          >
            <option value="placeholder">Local placeholder</option>
            <option value="url">External URL</option>
            <option disabled>Upload (available in a later version)</option>
          </select>
        </label>
        {coverType === "url" && (
          <label>
            Cover URL
            <input
              type="url"
              name="coverUrl"
              required
              defaultValue={game?.cover.type === "url" ? game.cover.url : ""}
              placeholder="https://example.com/cover.jpg"
            />
          </label>
        )}
        {error && (
          <p role="alert" className="error-message">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit">
            {busy ? "Saving…" : game ? "Save changes" : "Create game"}
          </Button>
        </div>
      </fieldset>
    </form>
  );
}
