import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createGameSchema,
  updateGameSchema,
  formatPlaytime,
} from "../src/lib/game";
import {
  InMemoryGameRepository,
  DuplicateGameError,
} from "../src/lib/repository";
import { initialFilters, selectGames } from "../src/lib/library-query";
const input = (title = "Example") => createGameSchema.parse({ title });
test("CRUD defaults, multi-platform identity, clone isolation and clearing optional fields", async () => {
  const repo = new InMemoryGameRepository();
  const created = await repo.createGame(input());
  assert.equal(created.status, "Unplayed");
  created.platforms.push("should not mutate repository");
  assert.deepEqual((await repo.getGame(created.id))?.platforms, []);
  await assert.rejects(
    repo.createGame(input("  EXAMPLE ")),
    DuplicateGameError,
  );
  const updated = await repo.updateGame(created.id, {
    platforms: ["PC", "Switch"],
    rating: 10,
    playtimeMinutes: 65,
  });
  assert.deepEqual(updated?.platforms, ["PC", "Switch"]);
  assert.equal(updated?.createdAt, created.createdAt);
  assert.equal(
    (await repo.updateGame(created.id, { rating: null }))?.rating,
    undefined,
  );
  assert.equal(formatPlaytime(updated?.playtimeMinutes), "1h 5m");
  assert.equal(await repo.deleteGame(created.id), true);
  assert.equal(await repo.getGame(created.id), undefined);
  assert.equal(
    await repo.updateGame(created.id, { status: "Playing" }),
    undefined,
  );
  assert.equal(await repo.deleteGame(created.id), false);
});
test("validation rejects invalid values and unsupported sources", () => {
  for (const invalid of [
    { title: " " },
    { rating: 0 },
    { rating: 11 },
    { rating: 1.5 },
    { playtimeMinutes: -1 },
    { playtimeMinutes: 0.5 },
    { platforms: "PC" },
    { tags: [""] },
    { status: "Unknown" },
    { releaseDate: "2026-02-30" },
    { cover: { type: "url", url: "javascript:alert(1)" } },
    { cover: { type: "upload", url: "https://example.com/a.png" } },
    { id: "user-set-id" },
  ]) {
    assert.equal(
      createGameSchema.safeParse({ title: "Example", ...invalid }).success,
      false,
      JSON.stringify(invalid),
    );
  }
  assert.equal(updateGameSchema.safeParse({}).success, false);
  assert.equal(
    createGameSchema.safeParse({
      title: "Example",
      rating: 1,
      playtimeMinutes: 0,
      releaseDate: "2024-02-29",
    }).success,
    true,
  );
});
test("combined filters, title-only search and optional-value sorting", async () => {
  const repo = new InMemoryGameRepository();
  await repo.createGame(
    createGameSchema.parse({
      title: "Beta",
      platforms: ["PC"],
      tags: ["Puzzle"],
      rating: 8,
      status: "Playing",
    }),
  );
  await repo.createGame(input("Alpha"));
  await repo.createGame(createGameSchema.parse({ title: "Gamma", rating: 10 }));
  const games = await repo.listGames();
  assert.deepEqual(
    selectGames(games, { ...initialFilters, sort: "rating" }).map(
      (g) => g.title,
    ),
    ["Gamma", "Beta", "Alpha"],
  );
  assert.deepEqual(
    selectGames(games, {
      ...initialFilters,
      query: "be",
      platform: "PC",
      tag: "Puzzle",
      rating: "8",
      status: "Playing",
    }).map((g) => g.title),
    ["Beta"],
  );
  assert.equal(
    selectGames(games, { ...initialFilters, query: "Puzzle" }).length,
    0,
  );
  assert.deepEqual(
    selectGames(games, { ...initialFilters, sort: "title" }).map(
      (g) => g.title,
    ),
    ["Alpha", "Beta", "Gamma"],
  );
});
