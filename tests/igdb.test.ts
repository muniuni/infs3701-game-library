import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createIgdbClient,
  IgdbError,
  normalizeIgdbGames,
  igdbApiError,
} from "../src/lib/server-igdb";
const timestamp = Date.parse("2024-02-29T00:00:00Z") / 1000;
const row = {
  id: 1,
  name: "Synthetic Adventure",
  first_release_date: timestamp,
  release_dates: [{ date: timestamp, date_format: { format: "YYYYMMMMDD" } }],
  genres: [{ name: "Puzzle" }, { name: "puzzle" }],
  cover: { image_id: "co_synthetic" },
};
function setup(handler?: (init: RequestInit, attempt: number) => Response) {
  let time = 100000,
    tokens = 0,
    attempts = 0;
  const starts: number[] = [];
  const bodies: string[] = [];
  const client = createIgdbClient({
    credentials: () => ({
      clientId: "synthetic-id",
      clientSecret: "synthetic-secret",
    }),
    now: () => time,
    wait: async (ms) => {
      time += ms;
    },
    fetch: async (url, init) => {
      assert.ok(init?.signal);
      assert.equal(init?.cache, "no-store");
      if (String(url).includes("oauth2/token")) {
        tokens++;
        assert.equal(
          new URLSearchParams(String(init?.body)).get("client_secret"),
          "synthetic-secret",
        );
        return Response.json({
          access_token: `token-${tokens}`,
          expires_in: 120,
        });
      }
      starts.push(time);
      bodies.push(String(init?.body));
      attempts++;
      return handler?.(init!, attempts) ?? Response.json([row]);
    },
  });
  return {
    client,
    starts,
    bodies,
    tokens: () => tokens,
    advance: (ms: number) => {
      time += ms;
    },
  };
}
test("IGDB maps genres and safe covers, and does not invent dates for partial releases", () => {
  const [game] = normalizeIgdbGames([row]);
  assert.equal(game.releaseDate, "2024-02-29");
  assert.deepEqual(game.tags, ["Puzzle"]);
  assert.equal(
    game.cover?.url,
    "https://images.igdb.com/igdb/image/upload/t_cover_big/co_synthetic.jpg",
  );
  const [partial] = normalizeIgdbGames([
    {
      ...row,
      release_dates: [{ date: timestamp, date_format: { format: "YYYY" } }],
      cover: { image_id: "../../unsafe" },
    },
  ]);
  assert.equal(partial.releaseDate, undefined);
  assert.equal(partial.cover, undefined);
  assert.equal(partial.releaseYear, 2024);
  assert.equal(
    normalizeIgdbGames([{ id: 2, name: "Missing metadata" }])[0].releaseDate,
    undefined,
  );
  assert.throws(() => normalizeIgdbGames({ error: "bad" }), IgdbError);
});
test("concurrent searches share a token and request pacing; search syntax is escaped", async () => {
  const fixture = setup();
  await Promise.all([
    fixture.client.search('A "quoted" title;'),
    fixture.client.search("Second"),
    fixture.client.get("1"),
  ]);
  assert.equal(fixture.tokens(), 1);
  assert.ok(fixture.starts[1] - fixture.starts[0] >= 260);
  assert.ok(fixture.starts[2] - fixture.starts[1] >= 260);
  assert.ok(fixture.bodies[0].includes('search "A \\"quoted\\" title;";'));
  assert.ok(fixture.bodies[2].includes("where id = 1;"));
  assert.throws(() => fixture.client.search(" "));
  assert.throws(() => fixture.client.search("x".repeat(161)));
  await assert.rejects(fixture.client.get("1; fields *;"));
  fixture.advance(61000);
  await fixture.client.search("Expired");
  assert.equal(fixture.tokens(), 2);
});
test("authentication renews once and transient failures retry within a bound", async () => {
  const fixture = setup((init, attempt) => {
    if (attempt === 1) return new Response(null, { status: 401 });
    if (attempt === 2)
      return new Response(null, {
        status: 429,
        headers: { "Retry-After": "1" },
      });
    assert.equal(
      new Headers(init.headers).get("Authorization"),
      "Bearer token-2",
    );
    return Response.json([row]);
  });
  assert.equal((await fixture.client.search("Synthetic"))[0].id, 1);
  assert.equal(fixture.tokens(), 2);
  assert.equal(fixture.starts.length, 3);
  const failed = setup(() => new Response(null, { status: 503 }));
  await assert.rejects(failed.client.search("Failure"), IgdbError);
  assert.equal(failed.starts.length, 2);
  // A failed request must not poison the shared queue.
  await assert.rejects(failed.client.search("Again"), IgdbError);
  assert.equal(failed.starts.length, 4);
});
test("configuration, transport, oversized bodies and provider errors expose no credentials", async () => {
  const client = createIgdbClient({ credentials: () => ({}) });
  await assert.rejects(
    client.search("Synthetic"),
    (err: unknown) => err instanceof IgdbError && err.status === 503,
  );
  const failed = createIgdbClient({
    credentials: () => ({
      clientId: "secret-id",
      clientSecret: "secret-value",
    }),
    fetch: async () => {
      throw new Error("secret-value");
    },
  });
  try {
    await failed.search("Synthetic");
    assert.fail();
  } catch (err) {
    const response = igdbApiError(err);
    assert.equal(response.status, 502);
    assert.equal((await response.text()).includes("secret-value"), false);
  }
  const oversized = setup(() => new Response("x".repeat(1024 * 1024 + 1)));
  await assert.rejects(oversized.client.search("Oversized"), IgdbError);
});
test("the process queue bounds pending requests and recovers after saturation", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let time = 0;
  const client = createIgdbClient({
    credentials: () => ({ clientId: "synthetic", clientSecret: "synthetic" }),
    now: () => time,
    wait: async (ms) => {
      time += ms;
    },
    fetch: async (url) => {
      if (String(url).includes("oauth2/token")) {
        await gate;
        return Response.json({
          access_token: "synthetic-token",
          expires_in: 3600,
        });
      }
      return Response.json([row]);
    },
  });
  const queued = Array.from({ length: 20 }, () => client.search("Synthetic"));
  await assert.rejects(
    client.search("Overflow"),
    (err: unknown) => err instanceof IgdbError && err.status === 429,
  );
  release();
  await Promise.all(queued);
  assert.equal((await client.search("Recovered"))[0].id, row.id);
});

test("metadata modes preserve personal tags and omit missing provider values", async () => {
  const { metadataChoices, applyMetadata, metadataProposal } =
    await import("../src/lib/igdb");
  const draft = {
    title: "Personal name",
    releaseDate: "",
    cover: { type: "upload" as const, url: "/api/covers/synthetic" },
    tags: ["Favourite", "puzzle"],
    developers: [],
    publishers: [],
    summary: "My summary",
    storyline: "",
    screenshots: [],
  };
  const game = {
    ...normalizeIgdbGames([row])[0],
    developers: ["Studio"],
    summary: "Provider summary",
    storyline: "Plot",
    screenshots: [{ imageId: "shot" }],
  };
  const empty = metadataChoices(draft, game, "empty");
  assert.equal(empty.title, false);
  assert.equal(empty.cover, false);
  assert.equal(empty.tags, false);
  assert.equal(empty.releaseDate, true);
  assert.equal(empty.summary, false);
  const filled = applyMetadata(draft, game, empty);
  assert.equal(filled.summary, "My summary");
  assert.deepEqual(filled.developers, ["Studio"]);
  const replace = metadataChoices(draft, game, "replace");
  const replaced = applyMetadata(draft, game, replace);
  assert.deepEqual(replaced.tags, ["Favourite", "puzzle"]);
  assert.equal(replaced.cover.type, "url");
  assert.equal(replaced.summary, "Provider summary");
  assert.deepEqual(
    metadataProposal(draft, { id: 2, title: draft.title }),
    draft,
  );
  assert.deepEqual(
    applyMetadata(draft, game, { ...empty, releaseDate: false }),
    { ...filled, releaseDate: "" },
  );
  const many = {
    ...draft,
    tags: Array.from({ length: 30 }, (_, i) => `Tag${i}`),
  };
  assert.equal(metadataProposal(many, game).tags.length, 31); // Never silently truncate a union.
});

test("provider normalizes companies, platforms, text and safe screenshot references", () => {
  const [game] = normalizeIgdbGames([
    {
      ...row,
      platforms: [{ id: 6, name: "PC (Microsoft Windows)" }],
      involved_companies: [
        { company: { name: "Studio" }, developer: true, publisher: true },
        { company: { name: "Support" }, supporting: true },
      ],
      summary: "Summary",
      storyline: "Story",
      screenshots: [{ image_id: "shot_1" }, { image_id: "../../unsafe" }],
    },
  ]);
  assert.deepEqual(game.availablePlatforms, [
    { id: 6, name: "PC (Microsoft Windows)" },
  ]);
  assert.deepEqual(game.developers, ["Studio"]);
  assert.deepEqual(game.publishers, ["Studio"]);
  assert.equal(game.storyline, "Story");
  assert.deepEqual(game.screenshots, [{ imageId: "shot_1" }]);
});

test("queued aborted searches do not reach IGDB or consume pending capacity", async () => {
  let unlock!: () => void;
  const gate = new Promise<void>((resolve) => {
    unlock = resolve;
  });
  const bodies: string[] = [];
  const client = createIgdbClient({
    credentials: () => ({ clientId: "fixture", clientSecret: "fixture" }),
    wait: async () => {},
    fetch: async (url, init) => {
      if (String(url).includes("oauth2")) {
        await gate;
        return Response.json({ access_token: "fixture", expires_in: 3600 });
      }
      bodies.push(String(init?.body));
      return Response.json([row]);
    },
  });
  const first = client.search("First");
  const abort = new AbortController();
  const stale = client.search("Stale", abort.signal);
  const rejected = assert.rejects(
    stale,
    (error) => error instanceof Error && error.name === "AbortError",
  );
  abort.abort();
  const latest = client.search("Latest");
  unlock();
  await Promise.all([first, rejected, latest]);
  assert.equal(bodies.length, 2);
  assert.ok(bodies.every((body) => !body.includes("Stale")));
  assert.ok(!bodies[0].includes("storyline"));
});
