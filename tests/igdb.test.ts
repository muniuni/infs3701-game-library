import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createIgdbClient,
  IgdbError,
  normalizeIgdbGames,
  igdbApiError,
} from "../src/lib/server-igdb";
import {
  defaultMetadataPreferences,
  metadataChoices,
  readMetadataPreferences,
} from "../src/lib/igdb";
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
test("Edit choices check available changes and retain valid Create preferences", () => {
  const proposal = normalizeIgdbGames([row])[0];
  const choices = metadataChoices(
    {
      title: "My title",
      releaseDate: "",
      tags: ["Favourite"],
      cover: { type: "placeholder" },
    },
    proposal,
  );
  assert.deepEqual(choices, {
    title: true,
    releaseDate: true,
    cover: true,
    tags: true,
  });
  const prefs = readMetadataPreferences(
    JSON.stringify({ ...defaultMetadataPreferences, cover: false }),
  );
  assert.equal(prefs.cover, false);
  assert.equal(
    metadataChoices(
      {
        title: proposal.title,
        releaseDate: "",
        tags: [],
        cover: { type: "placeholder" },
      },
      proposal,
    ).title,
    false,
  );
  assert.deepEqual(
    readMetadataPreferences("corrupt"),
    defaultMetadataPreferences,
  );
  assert.deepEqual(
    readMetadataPreferences('{"title":true}'),
    defaultMetadataPreferences,
  );
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

test("Create autofill merges genres, retains uploads, respects preferences and field limits", async () => {
  const { createAutofillDraft } = await import("../src/lib/igdb");
  const proposal = normalizeIgdbGames([row])[0];
  const draft = {
    title: "Manual title",
    releaseDate: "2020-01-01",
    tags: ["Favourite", "puzzle"],
    cover: { type: "upload" as const, url: "blob:manual" },
  };
  const result = createAutofillDraft(
    draft,
    proposal,
    defaultMetadataPreferences,
  );
  assert.deepEqual(result.draft.tags, ["Favourite", "puzzle"]);
  assert.deepEqual(result.draft.cover, draft.cover);
  assert.deepEqual(result.changed, ["title", "releaseDate"]);
  assert.deepEqual(draft.tags, ["Favourite", "puzzle"]);
  const withUrl = createAutofillDraft(
    {
      ...draft,
      tags: ["Favourite"],
      cover: { type: "url", url: "https://example.com/manual.jpg" },
    },
    proposal,
    defaultMetadataPreferences,
  );
  assert.deepEqual(withUrl.draft.tags, ["Favourite", "Puzzle"]);
  assert.deepEqual(withUrl.draft.cover, proposal.cover);
  const disabled = createAutofillDraft(draft, proposal, {
    title: false,
    releaseDate: false,
    tags: false,
    cover: false,
  });
  assert.deepEqual(disabled.draft, draft);
  assert.equal(disabled.changed.length, 0);
  const full = Array.from({ length: 30 }, (_, index) => `Manual ${index}`);
  assert.deepEqual(
    createAutofillDraft(
      { ...draft, tags: full },
      proposal,
      defaultMetadataPreferences,
    ).draft.tags,
    full,
  );
});

test("Edit genres append and unchanged merged tags are not offered", async () => {
  const { editAutofillProposal } = await import("../src/lib/igdb");
  const draft = {
    title: "Manual",
    releaseDate: "",
    tags: ["Personal", "puzzle"],
    cover: { type: "placeholder" as const },
  };
  const result = editAutofillProposal(draft, {
    ...normalizeIgdbGames([row])[0],
    tags: ["Puzzle", "Adventure"],
  });
  assert.deepEqual(result.tags, ["Personal", "puzzle", "Adventure"]);
  const same = editAutofillProposal({ ...draft, tags: result.tags! }, result);
  assert.equal(
    metadataChoices({ ...draft, tags: result.tags! }, same).tags,
    false,
  );
});
