"use client";
import { useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";
import { screenshotUrl } from "@/lib/igdb";
import type { Game } from "@/lib/game";

export function ScreenshotGallery({
  images,
  onChange,
}: {
  images: { imageId: string }[];
  onChange?: (images: { imageId: string }[]) => void;
}) {
  const [expanded, setExpanded] = useState<string>();
  const activeIndex = images.findIndex((image) => image.imageId === expanded);
  const [loaded, setLoaded] = useState<string>();
  function navigate(direction: number) {
    setExpanded(
      images[(activeIndex + direction + images.length) % images.length]
        ?.imageId,
    );
  }
  function move(index: number, direction: number) {
    const next = [...images];
    [next[index], next[index + direction]] = [
      next[index + direction],
      next[index],
    ];
    onChange?.(next);
  }
  return (
    <>
      <div className="screenshot-gallery">
        {images.map((image, index) => (
          <div className="screenshot-item" key={`${image.imageId}-${index}`}>
            <button
              type="button"
              className="screenshot-open"
              aria-label={`Enlarge screenshot ${index + 1}`}
              onClick={() => setExpanded(image.imageId)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={screenshotUrl(image.imageId)}
                alt={`Screenshot ${index + 1}`}
                loading="lazy"
              />
            </button>
            {onChange && (
              <div className="screenshot-tools">
                <span>{String(index + 1).padStart(2, "0")}</span>
                <button
                  type="button"
                  disabled={index === 0}
                  aria-label={`Move screenshot ${index + 1} earlier`}
                  onClick={() => move(index, -1)}
                >
                  <ChevronLeft size={14} />
                </button>
                <button
                  type="button"
                  disabled={index === images.length - 1}
                  aria-label={`Move screenshot ${index + 1} later`}
                  onClick={() => move(index, 1)}
                >
                  <ChevronRight size={14} />
                </button>
                <button
                  type="button"
                  aria-label={`Remove screenshot ${index + 1}`}
                  onClick={() => onChange(images.filter((_, i) => i !== index))}
                >
                  <X size={14} />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
      <Dialog
        open={!!expanded}
        onOpenChange={(open) => {
          if (!open) setExpanded(undefined);
        }}
      >
        <DialogContent
          className="screenshot-dialog"
          aria-describedby={undefined}
          showClose={false}
          onEscapeKeyDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
              event.preventDefault();
              navigate(event.key === "ArrowLeft" ? -1 : 1);
            }
          }}
        >
          <div className="screenshot-toolbar">
            <DialogTitle>
              Screenshot {activeIndex + 1} <span>/ {images.length}</span>
            </DialogTitle>
            <div>
              <button
                type="button"
                aria-label="Previous screenshot"
                disabled={images.length < 2}
                onClick={() => navigate(-1)}
              >
                <ChevronLeft size={20} />
              </button>
              <button
                type="button"
                aria-label="Next screenshot"
                disabled={images.length < 2}
                onClick={() => navigate(1)}
              >
                <ChevronRight size={20} />
              </button>
              <button
                type="button"
                aria-label="Close screenshot"
                onClick={() => setExpanded(undefined)}
              >
                <X size={20} />
              </button>
            </div>
          </div>
          <div className="screenshot-stage" aria-busy={loaded !== expanded}>
            {expanded && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={expanded}
                src={screenshotUrl(expanded, true)}
                alt="Enlarged game screenshot"
                onLoad={() => setLoaded(expanded)}
                onError={() => setLoaded(expanded)}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
export function GameMetadata({
  game,
}: {
  game: Pick<
    Game,
    "developers" | "publishers" | "summary" | "storyline" | "screenshots"
  >;
}) {
  return (
    <div className="game-metadata">
      {(!!game.developers?.length || !!game.publishers?.length) && (
        <dl className="company-details">
          {!!game.developers?.length && (
            <div>
              <dt>Developers</dt>
              <dd>{game.developers.join(", ")}</dd>
            </div>
          )}
          {!!game.publishers?.length && (
            <div>
              <dt>Publishers</dt>
              <dd>{game.publishers.join(", ")}</dd>
            </div>
          )}
        </dl>
      )}
      {game.summary && (
        <section>
          <h3>Summary</h3>
          <p className="metadata-prose">{game.summary}</p>
        </section>
      )}
      {game.storyline && (
        <details>
          <summary>Storyline</summary>
          <p className="metadata-prose">{game.storyline}</p>
        </details>
      )}
      {!!game.screenshots?.length && (
        <section>
          <h3>Screenshots</h3>
          <ScreenshotGallery images={game.screenshots} />
        </section>
      )}
    </div>
  );
}
