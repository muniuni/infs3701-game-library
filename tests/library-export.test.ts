import { test } from "node:test";
import assert from "node:assert/strict";
import type { Game } from "../src/lib/game";
import { createLibraryExport } from "../src/lib/library-export";

test("export allowlist preserves records and excludes storage, images and extra fields", () => {
  const game = {
    id: "private-internal-id",
    title: "日本語 Game",
    platforms: ["PC", "Switch"],
    tags: ["RPG"],
    status: "Completed",
    playtimeMinutes: 0,
    rating: 10,
    review: "Line one\nLine two",
    igdbId: 123,
    steamAppId: 456,
    availablePlatforms: [
      { id: 6, name: "PC", secret: "private-platform-extra" },
    ],
    developers: ["Studio"],
    publishers: [],
    summary: "Summary",
    storyline: "Story",
    releaseDate: "2020-01-02",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-02-01T00:00:00.000Z",
    cover: { type: "upload", url: "/api/covers/private-image" },
    screenshots: [{ imageId: "private-screenshot" }],
    coverKey: "private-s3-key",
    STEAM_WEB_API_KEY: "private-secret",
  } as unknown as Game;
  const result = JSON.parse(
    JSON.stringify(
      createLibraryExport([game], new Date("2026-10-11T00:00:00Z")),
    ),
  );
  assert.equal(result.schemaVersion, 1);
  assert.equal(result.exportedAt, "2026-10-11T00:00:00.000Z");
  assert.equal(result.gameCount, 1);
  assert.deepEqual(result.games[0], {
    title: game.title,
    platforms: ["PC", "Switch"],
    tags: ["RPG"],
    status: "Completed",
    playtimeMinutes: 0,
    rating: 10,
    review: game.review,
    igdbId: 123,
    steamAppId: 456,
    availablePlatforms: [{ id: 6, name: "PC" }],
    developers: ["Studio"],
    publishers: [],
    summary: "Summary",
    storyline: "Story",
    releaseDate: "2020-01-02",
    createdAt: game.createdAt,
    updatedAt: game.updatedAt,
  });
  assert.ok(!JSON.stringify(result).includes("private-"));
});

test("export retains nulls and empty arrays and handles an empty library", () => {
  const game = {
    title: "Unset",
    platforms: [],
    tags: [],
    status: "Unplayed",
    createdAt: "created",
    updatedAt: "updated",
    rating: null,
    review: null,
    developers: null,
    availablePlatforms: null,
  } as unknown as Game;
  const result = JSON.parse(JSON.stringify(createLibraryExport([game])))
    .games[0];
  for (const field of [
    "rating",
    "review",
    "releaseDate",
    "playtimeMinutes",
    "igdbId",
    "steamAppId",
    "summary",
    "storyline",
    "developers",
    "availablePlatforms",
  ])
    assert.equal(result[field], null);
  assert.deepEqual(result.platforms, []);
  assert.deepEqual(result.tags, []);
  assert.deepEqual(result.publishers, []);
  assert.equal(createLibraryExport([]).gameCount, 0);
  assert.deepEqual(createLibraryExport([]).games, []);
});
