import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { LocalCoverStorage } from "../src/lib/local-cover-storage";
import { S3CoverStorage } from "../src/lib/cover-storage";
import { createCoverStorage } from "../src/lib/server-cover-storage";

test("local cover files persist across storage instances with the correct content type", async () => {
  const directory = await mkdtemp(join(tmpdir(), "local-covers-"));
  try {
    const covers = join(directory, "covers");
    const storage = new LocalCoverStorage(covers);
    for (const [format, extension] of [
      ["jpeg", "jpg"],
      ["png", "png"],
      ["webp", "webp"],
    ] as const) {
      const key = `covers/${randomUUID()}`;
      const image = {
        bytes: await sharp({
          create: { width: 4, height: 4, channels: 3, background: "red" },
        })
          .toFormat(format)
          .toBuffer(),
        contentType: `image/${format}`,
      };
      await storage.put(key, image);
      assert.ok(
        (await readdir(covers)).includes(`${key.slice(7)}.${extension}`),
      );
      const reopened = new LocalCoverStorage(covers);
      assert.deepEqual(await reopened.get(key), image);
      await assert.rejects(
        storage.put(key, image),
        (error: unknown) => (error as NodeJS.ErrnoException).code === "EEXIST",
      );
      await reopened.delete(key);
      await reopened.delete(key);
      await assert.rejects(storage.get(key), /Cover file not found/);
    }
    assert.deepEqual(await readdir(covers), []);
    for (const key of [
      "../outside",
      "covers/../outside",
      `covers/${randomUUID()}/outside`,
    ]) {
      await assert.rejects(
        storage.put(key, {
          bytes: Buffer.from("test"),
          contentType: "image/png",
        }),
        /Invalid cover key/,
      );
      await assert.rejects(storage.get(key), /Invalid cover key/);
      await assert.rejects(storage.delete(key), /Invalid cover key/);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("storage mode chooses filesystem covers locally and S3 for EBS", () => {
  assert.ok(createCoverStorage("local") instanceof LocalCoverStorage);
  assert.ok(createCoverStorage("ebs") instanceof S3CoverStorage);
});
