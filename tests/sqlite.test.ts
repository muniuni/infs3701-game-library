import { execFileSync } from "node:child_process";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client";
import { SqliteGameRepository } from "../src/lib/sqlite-game-repository";
import { LocalCoverStorage } from "../src/lib/local-cover-storage";
import { DuplicateGameError } from "../src/lib/repository";
import { createGameSchema } from "../src/lib/game";
import type { CoverStorage, ImageUpload } from "../src/lib/cover-storage";
import { assertStorage, storageConfig } from "../scripts/storage-config.mjs";

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
async function setup() {
  const directory = await mkdtemp(join(tmpdir(), "library-test-"));
  const url = `file:${join(directory, "test.sqlite")}`;
  const connect = () =>
    new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) });
  const db = connect();
  const migration = await readFile(
    "prisma/migrations/20260930000000_initial/migration.sql",
    "utf8",
  );
  for (const sql of migration.split(";").filter((sql) => sql.trim()))
    await db.$executeRawUnsafe(sql);
  const storage = new FakeStorage();
  return {
    db,
    storage,
    connect,
    directory,
    repo: new SqliteGameRepository(db, storage),
  };
}

test("SQLite persists across connections, enforces normalized uniqueness and preserves optional fields", async () => {
  const { db, repo, storage, connect, directory } = await setup();
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
      import { PrismaClient } from './src/generated/prisma/client.ts';
      import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
      const db = new PrismaClient({adapter: new PrismaBetterSqlite3({url: process.env.TEST_DATABASE_URL})});
      console.log(JSON.stringify((await db.game.findUnique({where: {id: process.env.TEST_GAME_ID}})).data));
      await db.$disconnect();
    `,
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          TEST_DATABASE_URL: `file:${join(directory, "test.sqlite")}`,
          TEST_GAME_ID: created.id,
        },
      },
    );
    assert.equal(JSON.parse(persisted).title, "Ｆoo  Bar");
    const reopened = connect();
    try {
      const next = new SqliteGameRepository(reopened, storage);
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
    await db.$disconnect();
    await rm(directory, { recursive: true, force: true });
  }
});

test("cover save, preservation, replacements and deletion clean up only retired objects", async () => {
  const { db, repo, storage, directory } = await setup();
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
    await db.$disconnect();
    await rm(directory, { recursive: true, force: true });
  }
});

test("failed saves, ambiguous uploads and failed deletes retain recoverable cleanup records", async () => {
  const { db, repo, storage, connect, directory } = await setup();
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
      const next = new SqliteGameRepository(nextDb, storage);
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
    await db.$disconnect();
    await rm(directory, { recursive: true, force: true });
  }
});

test("storage configuration rejects missing EBS identity and root-volume fallback", () => {
  assert.equal(
    storageConfig({
      STORAGE_MODE: "local",
      DATABASE_URL: "file:/tmp/test.sqlite",
    }).mode,
    "local",
  );
  assert.throws(() => storageConfig({ DATABASE_URL: "file:relative.sqlite" }));
  assert.throws(() =>
    assertStorage({
      STORAGE_MODE: "ebs",
      DATABASE_URL: "file:/tmp/test.sqlite",
    }),
  );
  assert.throws(() => assertStorage({ STORAGE_MODE: "ebs" }));
});

test("SQLite saves, failed saves, replacements and deletion manage local cover files", async () => {
  const { db, directory } = await setup();
  const covers = join(directory, "covers");
  const repo = new SqliteGameRepository(db, new LocalCoverStorage(covers));
  try {
    const game = await repo.createGame(input(), image);
    const firstFiles = await readdir(covers);
    assert.equal(firstFiles.length, 1);
    await assert.rejects(repo.createGame(input(), image), DuplicateGameError);
    assert.deepEqual(await readdir(covers), firstFiles);
    const next = new SqliteGameRepository(db, new LocalCoverStorage(covers));
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
    await db.$disconnect();
    await rm(directory, { recursive: true, force: true });
  }
});
