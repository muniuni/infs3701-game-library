import { test } from "node:test";
import assert from "node:assert/strict";
import {
  steamAccount,
  normalizeOwned,
  createSteamClient,
} from "../src/lib/server-steam";
import {
  steamChoices,
  steamInput,
  matchSteam,
  steamPreferencesSchema,
  type SteamEntry,
} from "../src/lib/steam";
import { createGameSchema, type Game } from "../src/lib/game";
import { createIgdbClient } from "../src/lib/server-igdb";
const steam = { appId: 10, title: "Game", playtimeMinutes: 120 };
const current: Game = {
  ...createGameSchema.parse({
    title: "Game",
    platforms: ["PS5"],
    tags: ["Adventure"],
    status: "Completed",
    playtimeMinutes: 60,
    rating: 9,
    review: "My review",
    cover: { type: "url", url: "https://example.com/manual.jpg" },
  }),
  igdbId: undefined,
  id: "00000000-0000-4000-8000-000000000001",
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
} as Game;
const igdb = {
  id: 20,
  title: "Game",
  tags: ["RPG"],
  cover: { type: "url" as const, url: "https://images.igdb.com/cover.jpg" },
  summary: "Summary",
};
const entry: SteamEntry = {
  operationId: "00000000-0000-4000-8000-000000000002",
  steam,
  igdb,
  choices: {},
};
test("Steam accounts validate exact hosts/routes and retain ID64 precision", () => {
  assert.deepEqual(steamAccount("76561198000000000"), {
    id: "76561198000000000",
  });
  assert.deepEqual(
    steamAccount("https://steamcommunity.com/profiles/76561198000000000/"),
    { id: "76561198000000000" },
  );
  assert.deepEqual(steamAccount("https://steamcommunity.com/id/example"), {
    vanity: "example",
  });
  for (const url of [
    "https://steamcommunity.com.evil.test/id/a",
    "https://evil.test/id/a",
    "https://steamcommunity.com@evil.test/id/a",
    "http://localhost/id/a",
    "https://steamcommunity.com/id/a?key=x",
    "76561198000000000.0",
  ])
    assert.throws(() => steamAccount(url));
});
test("Steam distinguishes explicit empty libraries, inaccessible details and hidden playtime", () => {
  assert.deepEqual(normalizeOwned({ response: { game_count: 0 } }), []);
  assert.throws(() => normalizeOwned({ response: {} }), /unavailable/);
  assert.throws(
    () => normalizeOwned({ response: { game_count: 1 } }),
    /unavailable/,
  );
  assert.deepEqual(
    normalizeOwned({
      response: { game_count: 1, games: [{ appid: 10, name: "Game" }] },
    }),
    [{ appId: 10, title: "Game", playtimeMinutes: undefined }],
  );
});
test("Steam client resolves vanity, includes played free games, retries and keeps errors safe", async () => {
  let calls = 0;
  const client = createSteamClient({
    key: () => "secret-value",
    wait: async () => {},
    fetch: async (input) => {
      const url = new URL(String(input));
      assert.equal(url.hostname, "api.steampowered.com");
      calls++;
      if (calls === 1) return new Response(null, { status: 503 });
      if (url.pathname.includes("ResolveVanityURL"))
        return Response.json({
          response: { success: 1, steamid: "76561198000000000" },
        });
      assert.equal(url.searchParams.get("include_played_free_games"), "true");
      return Response.json({
        response: {
          game_count: 1,
          games: [{ appid: 10, name: "Game", playtime_forever: 120 }],
        },
      });
    },
  });
  assert.deepEqual(
    (await client.library("https://steamcommunity.com/id/example")).games,
    [steam],
  );
  assert.equal(calls, 3);
  await assert.rejects(
    createSteamClient({
      key: () => "secret-value",
      fetch: async () => {
        throw new Error("secret-value");
      },
    }).library("76561198000000000"),
    (error) =>
      error instanceof Error && !error.message.includes("secret-value"),
  );
});
test("Steam update modes protect personal fields and playtime regardless of remembered defaults", () => {
  const empty = steamChoices(steam, igdb, current, {
    mode: "empty",
    fields: {},
  });
  assert.equal(empty.summary, true);
  assert.equal(empty.cover, false);
  assert.equal(empty.playtimeMinutes, false);
  for (const mode of ["replace", "manual"] as const) {
    const choices = steamChoices(steam, igdb, current, {
      mode,
      fields: { playtimeMinutes: true, cover: true },
    });
    assert.equal(choices.playtimeMinutes, false);
    assert.equal(choices.cover, true);
  }
  const update = steamInput(
    {
      ...entry,
      choices: {
        tags: true,
        cover: true,
        platforms: true,
        playtimeMinutes: true,
      },
    },
    current,
  );
  assert.deepEqual(update.tags, ["Adventure", "RPG"]);
  assert.deepEqual(update.platforms, ["PS5", "Steam"]);
  assert.equal(update.playtimeMinutes, 120);
  assert.equal(update.status, undefined);
  assert.equal(update.review, undefined);
  assert.equal(update.rating, undefined);
  const created = steamInput({ ...entry, choices: { playtimeMinutes: true } });
  assert.equal(created.title, "Game");
  assert.deepEqual(created.platforms, ["Steam"]);
  assert.equal(created.status, "Unplayed");
  assert.equal(
    steamPreferencesSchema.safeParse({ mode: "oops", fields: {} }).success,
    false,
  );
});
test("Steam matching detects title candidates, conflicting identities and cross-record collisions", () => {
  assert.equal(matchSteam(steam, igdb, [current]).titleOnly, true);
  assert.equal(
    matchSteam(steam, igdb, [{ ...current, steamAppId: 99 }]).conflict,
    true,
  );
  assert.equal(
    matchSteam(steam, igdb, [{ ...current, steamAppId: 10, title: "Renamed" }])
      .current?.id,
    current.id,
  );
  assert.equal(
    matchSteam(steam, igdb, [
      { ...current, steamAppId: 10 },
      { ...current, id: "other", title: "Other", igdbId: 20 },
    ]).conflict,
    true,
  );
});
test("IGDB Steam matching uses external source IDs, preserves ambiguity and batches detail lookup", async () => {
  const bodies: string[] = [];
  const client = createIgdbClient({
    credentials: () => ({ clientId: "test", clientSecret: "test" }),
    wait: async () => {},
    fetch: async (url, init) => {
      if (String(url).includes("oauth2"))
        return Response.json({ access_token: "test", expires_in: 3600 });
      bodies.push(String(init?.body));
      if (String(url).endsWith("external_game_sources"))
        return Response.json([{ id: 42, name: "Steam" }]);
      if (String(url).endsWith("external_games"))
        return Response.json([
          { uid: "10", game: 20 },
          { uid: "11", game: 21 },
          { uid: "11", game: 22 },
        ]);
      return Response.json([{ id: 20, name: "Game" }]);
    },
  });
  const result = await client.matchSteam([10, 11, 12]);
  assert.equal(result[0].game?.id, 20);
  assert.equal(result[1].ambiguous, true);
  assert.equal(result[2].game, undefined);
  assert.ok(bodies.some((body) => body.includes("external_game_source = 42")));
});
