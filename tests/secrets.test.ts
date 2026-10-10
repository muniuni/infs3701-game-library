import { test } from "node:test";
import assert from "node:assert/strict";
import { createSecretLoader } from "../src/lib/server-secrets";
import { createIgdbClient, IgdbError } from "../src/lib/server-igdb";
import { createSteamClient, SteamError } from "../src/lib/server-steam";

const igdb = { IGDB_CLIENT_ID: "test-id", IGDB_CLIENT_SECRET: "test-secret" };

test("development and explicit local production use environment without AWS", async () => {
  for (const settings of [
    { NODE_ENV: "development" },
    { NODE_ENV: "production", SECRETS_SOURCE: "env" },
  ]) {
    const secrets = createSecretLoader({
      env: { ...settings, ...igdb, STEAM_WEB_API_KEY: "local-key" },
      read: async () => {
        assert.fail("AWS must not be called");
      },
    });
    assert.deepEqual(await secrets.igdb(), {
      clientId: "test-id",
      clientSecret: "test-secret",
    });
    assert.equal(await secrets.steam(), "local-key");
  }
  const empty = createSecretLoader({ env: {} });
  assert.equal(await empty.steam(), "");
});

test("production secrets are lazy, deduplicated, cached independently and refreshed after five minutes", async () => {
  let time = 0;
  const calls: string[] = [];
  const secrets = createSecretLoader({
    env: {
      NODE_ENV: "production",
      ...igdb,
      STEAM_WEB_API_KEY: "ignored-env-key",
    },
    now: () => time,
    read: async (id) => {
      calls.push(id);
      return JSON.stringify(
        id.endsWith("/igdb")
          ? { ...igdb, IGDB_CLIENT_SECRET: `secret-${time}` }
          : { STEAM_WEB_API_KEY: "aws-key" },
      );
    },
  });
  assert.equal(calls.length, 0);
  const results = await Promise.all([
    secrets.igdb(),
    secrets.igdb(),
    secrets.steam(),
  ]);
  assert.deepEqual(calls, [
    "infs3701/game-library/igdb",
    "infs3701/game-library/steam",
  ]);
  assert.deepEqual(results[0], results[1]);
  assert.equal(results[2], "aws-key");
  time = 299999;
  assert.equal((await secrets.igdb()).clientSecret, "secret-0");
  assert.equal(calls.length, 2);
  time = 300000;
  assert.equal((await secrets.igdb()).clientSecret, "secret-300000");
  assert.equal(calls.length, 3);
});

test("invalid secrets and AWS failures are sanitized and retried, without env fallback", async () => {
  for (const invalid of [
    undefined,
    "private-invalid-json",
    "null",
    "[]",
    "{}",
    '{"STEAM_WEB_API_KEY":42}',
    '{"STEAM_WEB_API_KEY":" "}',
  ]) {
    let attempts = 0;
    const secrets = createSecretLoader({
      env: { SECRETS_SOURCE: "aws", STEAM_WEB_API_KEY: "must-not-fallback" },
      read: async () =>
        ++attempts === 1 ? invalid : '{"STEAM_WEB_API_KEY":"recovered"}',
    });
    await assert.rejects(secrets.steam(), {
      message: "Server credentials are unavailable.",
    });
    assert.equal(await secrets.steam(), "recovered");
  }
  let time = 0;
  let fail = false;
  const secrets = createSecretLoader({
    env: { SECRETS_SOURCE: "aws", ...igdb },
    now: () => time,
    read: async () => {
      if (fail) throw new Error("AWS error containing private data");
      return JSON.stringify(igdb);
    },
  });
  await secrets.igdb();
  time = 300000;
  fail = true;
  await assert.rejects(secrets.igdb(), {
    message: "Server credentials are unavailable.",
  });
  fail = false;
  assert.equal((await secrets.igdb()).clientId, "test-id");
  await assert.rejects(
    createSecretLoader({ env: { SECRETS_SOURCE: "typo" } }).steam(),
    /Invalid server credential source/,
  );
  await assert.rejects(
    createSecretLoader({
      env: { SECRETS_SOURCE: "aws" },
      read: async () => '{"IGDB_CLIENT_ID":"only-id"}',
    }).igdb(),
    /Server credentials are unavailable/,
  );
});

test("provider clients accept async credentials and return safe 503 errors on loader failure", async () => {
  const credentials = async () => {
    throw new Error("private-secret");
  };
  const fetcher: typeof fetch = async () => {
    assert.fail("No provider call without credentials");
  };
  await assert.rejects(
    createIgdbClient({ credentials, fetch: fetcher }).search("test"),
    (error: unknown) =>
      error instanceof IgdbError &&
      error.status === 503 &&
      !error.message.includes("private-secret"),
  );
  await assert.rejects(
    createSteamClient({ key: credentials, fetch: fetcher }).library(
      "76561198000000000",
    ),
    (error: unknown) =>
      error instanceof SteamError &&
      error.status === 503 &&
      !error.message.includes("private-secret"),
  );
  const steam = createSteamClient({
    key: async () => "async-key",
    fetch: async (url) => {
      assert.equal(new URL(String(url)).searchParams.get("key"), "async-key");
      return Response.json({ response: { game_count: 0 } });
    },
  });
  assert.deepEqual((await steam.library("76561198000000000")).games, []);
});

test("IGDB refreshes its OAuth token when cached secret credentials rotate", async () => {
  let time = 0;
  let tokens = 0;
  const secrets = createSecretLoader({
    env: { SECRETS_SOURCE: "aws" },
    now: () => time,
    read: async () =>
      JSON.stringify({ ...igdb, IGDB_CLIENT_SECRET: `secret-${time}` }),
  });
  const client = createIgdbClient({
    credentials: secrets.igdb,
    now: () => time,
    wait: async () => {},
    fetch: async (url, init) => {
      if (String(url).includes("oauth2/token")) {
        tokens++;
        assert.equal(
          new URLSearchParams(String(init?.body)).get("client_secret"),
          `secret-${time}`,
        );
        return Response.json({
          access_token: `token-${tokens}`,
          expires_in: 3600,
        });
      }
      assert.equal(
        (init?.headers as Record<string, string>).Authorization,
        `Bearer token-${tokens}`,
      );
      return Response.json([]);
    },
  });
  await client.search("first");
  await client.search("cached");
  assert.equal(tokens, 1);
  time = 300000;
  await client.search("rotated");
  assert.equal(tokens, 2);
});
