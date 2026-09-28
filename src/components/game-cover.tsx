"use client";
import { useState } from "react";
import type { Cover } from "@/lib/game";
export function GameCover({ cover, title }: { cover: Cover; title: string }) {
  const url =
    cover.type === "placeholder" ? "/cover-placeholder.svg" : cover.url;
  const [failedUrl, setFailedUrl] = useState<string>();
  // Remote covers remain browser-fetched URLs; the server does not proxy arbitrary URLs.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={failedUrl === url ? "/cover-placeholder.svg" : url}
      alt={`${title} cover`}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailedUrl(url)}
    />
  );
}
