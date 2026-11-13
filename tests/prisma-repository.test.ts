import { execFileSync } from "node:child_process";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDatabase } from "../src/lib/database";
import {
  PrismaGameRepository,
  duplicateIdentity,
} from "../src/lib/prisma-game-repository";
import { LocalCoverStorage } from "../src/lib/local-cover-storage";
import { DuplicateGameError } from "../src/lib/repository";
import { createGameSchema } from "../src/lib/game";
import type { CoverStorage, ImageUpload } from "../src/lib/cover-storage";
import {
  LOCAL_DATABASE_URL,
  assertStorage,
  storageConfig,
} from "../scripts/storage-config.mjs";
import { createTestDatabase } from "../scripts/test-database.mjs";

class FakeStorage implements CoverStorage {
  objects = new Map<string, ImageUpload>();
  failPut = false;
  failDelete = false;
  async put(key: string, value: ImageUpload) {
    this.objects.set(key, value);
    if (this.failPut) throw new Error("Lost PUT response");
  }
  async get(key: string) {
    return this.objects.get(key)!;
  }
  async delete(key: string) {
    if (this.failDelete) throw new Error("S3 unavailable");
    this.objects.delete(key);
  }
}
const image = {
  bytes: Buffer.from("test storage payload"),
  contentType: "image/png",
};
const input = (title = "Example") =>
  createGameSchema.parse({ title, playtimeMinutes: Number.MAX_SAFE_INTEGER });
// Each test gets its own migrated database on the local Docker PostgreSQL.
async function setup() {
  const directory = await mkdtemp(join(tmpdir(), "library-test-"));
  const database = await createTestDatabase();
  const connect = () => createDatabase(database.url);
  const db = connect();
  const storage = new FakeStorage();
  return {
    db,
    storage,
    connect,
    directory,
    url: database.url,
    repo: new PrismaGameRepository(db, storage),
    async cleanup() {
      await db.$disconnect();
      await database.drop();
      await rm(directory, { recursive: true, force: true });
    },
  };
}

test("PostgreSQL persists across connections, enforces normalized uniqueness and preserves optional fields", async () => {
  const { db, repo, storage, connect, url, cleanup } = await setup();
  try {
    const created = await repo.createGame(input("Ｆoo  Bar"));
    await assert.rejects(repo.createGame(input("foo bar")), DuplicateGameError);
    await repo.updateGame(created.id, {
      rating: 10,
      review: "Good",
      tags: ["Puzzle", "puzzle"],
    });
    await db.$disconnect();
    const persisted = execFileSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "--input-type=module",
        "-e",
        `
      import { createDatabase } from './src/lib/database.ts';
      const db = createDatabase(process.env.TEST_GAME_DATABASE_URL);
      console.log(JSON.stringify((await db.game.findUnique({where: {id: process.env.TEST_GAME_ID}})).data));
      await db.$disconnect();
    `,
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          TEST_GAME_DATABASE_URL: url,
          TEST_GAME_ID: created.id,
        },
      },
    );
    assert.equal(JSON.parse(persisted).title, "Ｆoo  Bar");
    const reopened = connect();
    try {
      const next = new PrismaGameRepository(reopened, storage);
      const saved = await next.getGame(created.id);
      assert.equal(saved?.rating, 10);
      assert.equal(saved?.playtimeMinutes, Number.MAX_SAFE_INTEGER);
      assert.deepEqual(saved?.tags, ["Puzzle"]);
      assert.equal(saved?.createdAt, created.createdAt);
      const cleared = await next.updateGame(created.id, {
        rating: null,
        review: null,
      });
      assert.equal(cleared?.rating, undefined);
      assert.equal((await next.getGame(created.id))?.review, undefined);
      assert.equal(await next.deleteGame(created.id), true);
      assert.equal(await next.deleteGame(created.id), false);
      assert.equal(
        await next.updateGame(created.id, { title: "Missing" }),
        undefined,
      );
    } finally {
      await reopened.$disconnect();
    }
  } finally {
    await cleanup();
  }
});

test("cover save, preservation, replacements and deletion clean up only retired objects", async () => {
  const { db, repo, storage, cleanup } = await setup();
  try {
    const game = await repo.createGame(input(), image);
    assert.equal(game.cover.type, "upload");
    const firstKey = [...storage.objects.keys()][0];
    assert.deepEqual(
      (await repo.updateGame(game.id, { status: "Playing" }))?.cover,
      game.cover,
    );
    assert.equal(storage.objects.size, 1);
    assert.deepEqual(await repo.getCover(firstKey.slice(7)), image);
    const replaced = await repo.updateGame(
      game.id,
      { title: "Replaced" },
      image,
    );
    assert.notDeepEqual(replaced?.cover, game.cover);
    assert.equal(storage.objects.has(firstKey), false);
    assert.equal(await repo.getCover(firstKey.slice(7)), undefined);
    await repo.updateGame(game.id, {
      cover: { type: "url", url: "https://example.com/cover.png" },
    });
    assert.equal(storage.objects.size, 0);
    await repo.updateGame(game.id, { status: "Completed" }, image);
    await repo.updateGame(game.id, { cover: { type: "placeholder" } });
    assert.equal(storage.objects.size, 0);
    await repo.updateGame(game.id, { status: "Playing" }, image);
    await repo.deleteGame(game.id);
    assert.equal(storage.objects.size, 0);
    assert.equal(await db.coverObject.count(), 0);
  } finally {
    await cleanup();
  }
});

test("failed saves, ambiguous uploads and failed deletes retain recoverable cleanup records", async () => {
  const { db, repo, storage, connect, cleanup } = await setup();
  try {
    const game = await repo.createGame(input(), image);
    await assert.rejects(repo.createGame(input(), image), DuplicateGameError);
    assert.equal(storage.objects.size, 1);
    storage.failPut = true;
    await assert.rejects(repo.updateGame(game.id, { title: "Changed" }, image));
    assert.equal((await repo.getGame(game.id))?.title, "Example");
    assert.equal(storage.objects.size, 1);
    storage.failPut = false;
    storage.failDelete = true;
    assert.equal(await repo.deleteGame(game.id), true);
    assert.equal(
      await db.coverObject.count({ where: { state: "garbage" } }),
      1,
    );
    await db.$disconnect();
    const nextDb = connect();
    try {
      storage.failDelete = false;
      const next = new PrismaGameRepository(nextDb, storage);
      await next.cleanup();
      assert.equal(storage.objects.size, 0);
      // Crash before attaching: only expired pending uploads are swept.
      await nextDb.coverObject.create({
        data: {
          key: "covers/abandoned",
          state: "pending",
          updatedAt: new Date(0),
        },
      });
      await nextDb.coverObject.create({
        data: { key: "covers/active", state: "pending" },
      });
      storage.objects.set("covers/abandoned", image);
      await next.cleanup();
      assert.equal(storage.objects.has("covers/abandoned"), false);
      assert.equal(
        await nextDb.coverObject.count({ where: { key: "covers/active" } }),
        1,
      );
    } finally {
      await nextDb.$disconnect();
    }
  } finally {
    await cleanup();
  }
});

test("storage mode selects covers only and the database is always PostgreSQL", () => {
  assert.deepEqual(storageConfig({}), {
    mode: "local",
    url: LOCAL_DATABASE_URL,
  });
  assert.equal(storageConfig({ NODE_ENV: "production" }).mode, "s3");
  assert.equal(
    storageConfig({ STORAGE_MODE: "s3", DATABASE_URL: "postgres://h/db" }).url,
    "postgres://h/db",
  );
  assert.throws(() => storageConfig({ STORAGE_MODE: "ebs" }), /local or s3/);
  assert.throws(
    () => storageConfig({ DATABASE_URL: "file:/tmp/test.sqlite" }),
    /postgresql/,
  );
  // Production never falls back to the local Docker database.
  assert.throws(
    () => assertStorage({ NODE_ENV: "production" }),
    /DATABASE_URL is required/,
  );
});

test("PostgreSQL saves, failed saves, replacements and deletion manage local cover files", async () => {
  const { db, directory, cleanup } = await setup();
  const covers = join(directory, "covers");
  const repo = new PrismaGameRepository(db, new LocalCoverStorage(covers));
  try {
    const game = await repo.createGame(input(), image);
    const firstFiles = await readdir(covers);
    assert.equal(firstFiles.length, 1);
    await assert.rejects(repo.createGame(input(), image), DuplicateGameError);
    assert.deepEqual(await readdir(covers), firstFiles);
    const next = new PrismaGameRepository(db, new LocalCoverStorage(covers));
    assert.deepEqual(await next.getCover(firstFiles[0].slice(0, -4)), image);
    assert.deepEqual(
      (await next.updateGame(game.id, { title: "Edited" }))?.cover,
      game.cover,
    );
    await next.updateGame(game.id, { status: "Playing" }, image);
    const replacedFiles = await readdir(covers);
    assert.equal(replacedFiles.length, 1);
    assert.notDeepEqual(replacedFiles, firstFiles);
    await next.updateGame(game.id, { cover: { type: "placeholder" } });
    assert.deepEqual(await readdir(covers), []);
    await next.updateGame(game.id, { status: "Completed" }, image);
    await next.deleteGame(game.id);
    assert.deepEqual(await readdir(covers), []);
    assert.equal(await db.coverObject.count(), 0);
  } finally {
    await cleanup();
  }
});

test("IGDB identity and expanded metadata persist, reject duplicate links and preserve old records", async () => {
  const { db, repo, connect, storage, cleanup } = await setup();
  try {
    const legacy = await repo.createGame(input("Legacy"));
    assert.equal(legacy.igdbId, undefined);
    const saved = await repo.updateGame(legacy.id, {
      igdbId: 777,
      availablePlatforms: [{ id: 6, name: "PC" }],
      developers: ["Studio"],
      publishers: ["Publisher"],
      summary: "概要".repeat(1000),
      storyline: "Story",
      screenshots: [{ imageId: "screenshot_1" }],
    });
    assert.equal(saved?.igdbId, 777);
    await assert.rejects(
      repo.createGame({ ...input("Different title"), igdbId: 777 }),
      (error) =>
        error instanceof DuplicateGameError && error.message.includes("IGDB"),
    );
    const other = await repo.createGame(input("Other"));
    await assert.rejects(
      repo.updateGame(other.id, { igdbId: 777 }),
      DuplicateGameError,
    );
    await db.$disconnect();
    const reopened = connect();
    try {
      const persisted = await new PrismaGameRepository(
        reopened,
        storage,
      ).getGame(legacy.id);
      assert.deepEqual(persisted?.screenshots, [{ imageId: "screenshot_1" }]);
      assert.equal(persisted?.summary, "概要".repeat(1000));
      assert.equal(persisted?.igdbId, 777);
    } finally {
      await reopened.$disconnect();
    }
  } finally {
    await cleanup();
  }
});

test("Steam imports persist identity, reject stale previews and replay receipts without overwriting later edits", async () => {
  const { db, repo, cleanup } = await setup();
  try {
    const operationId = "00000000-0000-4000-8000-000000000001";
    const entry = {
      operationId,
      steam: { appId: 123, title: "Steam game", playtimeMinutes: 60 },
      choices: { playtimeMinutes: true },
    };
    const game = await repo.importSteam(entry);
    assert.equal(game.steamAppId, 123);
    assert.deepEqual(game.platforms, ["Steam"]);
    const edited = await repo.updateGame(game.id, {
      playtimeMinutes: 150,
      review: "Manual",
    });
    const replay = await repo.importSteam(entry);
    assert.equal(replay.id, game.id);
    assert.equal(replay.playtimeMinutes, 150);
    await assert.rejects(
      repo.importSteam({
        ...entry,
        steam: { ...entry.steam, playtimeMinutes: 90 },
      }),
      /request changed/,
    );
    await assert.rejects(
      repo.importSteam({
        ...entry,
        operationId: "00000000-0000-4000-8000-000000000002",
        targetId: game.id,
        expectedUpdatedAt: game.updatedAt,
      }),
      /changed after preview/,
    );
    const updated = await repo.importSteam({
      ...entry,
      operationId: "00000000-0000-4000-8000-000000000003",
      targetId: game.id,
      expectedUpdatedAt: edited!.updatedAt,
      steam: { ...entry.steam, playtimeMinutes: 200 },
    });
    assert.equal(updated.playtimeMinutes, 200);
    assert.equal(updated.review, "Manual");
    await assert.rejects(
      repo.createGame({ ...input("Other Steam title"), steamAppId: 123 }),
      DuplicateGameError,
    );
    assert.equal(await db.game.count(), 1);
    assert.equal(await db.steamImportReceipt.count(), 2);
  } finally {
    await cleanup();
  }
});

test("concurrent retries of one Steam import return the committed game instead of a duplicate error", async () => {
  const { repo, connect, storage, db, cleanup } = await setup();
  // A second client stands in for another app instance behind the ALB.
  const otherDb = connect();
  const other = new PrismaGameRepository(otherDb, storage);
  try {
    const entry = {
      operationId: "00000000-0000-4000-8000-000000000010",
      steam: { appId: 456, title: "Concurrent", playtimeMinutes: 10 },
      choices: { playtimeMinutes: true },
    };
    const [first, second] = await Promise.all([
      repo.importSteam(entry),
      other.importSteam(entry),
    ]);
    assert.equal(first.id, second.id);
    assert.equal(await db.game.count(), 1);
    // Same for an update import racing on an existing game.
    const update = {
      ...entry,
      operationId: "00000000-0000-4000-8000-000000000011",
      targetId: first.id,
      expectedUpdatedAt: first.updatedAt,
      steam: { ...entry.steam, playtimeMinutes: 20 },
    };
    const updates = await Promise.all([
      repo.importSteam(update),
      other.importSteam(update),
    ]);
    assert.deepEqual(
      updates.map((game) => game.playtimeMinutes),
      [20, 20],
    );
    assert.equal(await db.steamImportReceipt.count(), 2);
  } finally {
    await otherDb.$disconnect();
    await cleanup();
  }
});

test("only Game identity conflicts map to duplicate-game messages", async () => {
  const { db, cleanup } = await setup();
  try {
    await db.game.create({
      data: { id: "a", titleKey: "a", igdbId: 1, steamAppId: 2, data: {} },
    });
    const conflict = (data: Parameters<typeof db.game.create>[0]["data"]) =>
      db.game.create({ data }).then(
        () => assert.fail("expected a unique violation"),
        (error: unknown) => duplicateIdentity(error),
      );
    assert.equal(await conflict({ id: "b", titleKey: "a", data: {} }), "title");
    assert.equal(
      await conflict({ id: "c", titleKey: "c", igdbId: 1, data: {} }),
      "igdb",
    );
    assert.equal(
      await conflict({ id: "d", titleKey: "d", steamAppId: 2, data: {} }),
      "steam",
    );
    await db.steamImportReceipt.create({
      data: { id: "r", fingerprint: "f", gameId: "a" },
    });
    const receipt = await db.steamImportReceipt
      .create({ data: { id: "r", fingerprint: "f", gameId: "a" } })
      .catch((error: unknown) => error);
    assert.equal(duplicateIdentity(receipt), undefined);
  } finally {
    await cleanup();
  }
});
