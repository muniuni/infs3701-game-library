import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import {
  validateImage,
  MAX_COVER_BYTES,
  UploadError,
} from "../src/lib/cover-storage";
import { readMutation } from "../src/lib/mutation-body";

test("server validates actual image bytes, format, corruption and size", async () => {
  for (const format of ["jpeg", "png", "webp"] as const) {
    const bytes = await sharp({
      create: { width: 4, height: 4, channels: 3, background: "red" },
    })
      .toFormat(format)
      .toBuffer();
    const file = new File([new Uint8Array(bytes)], `test.${format}`, {
      type: `image/${format}`,
    });
    assert.equal((await validateImage(file)).contentType, file.type);
    await assert.rejects(
      validateImage(
        new File([new Uint8Array(bytes)], "fake.jpg", {
          type: format === "png" ? "image/jpeg" : "image/png",
        }),
      ),
      UploadError,
    );
  }
  await assert.rejects(
    validateImage(
      new File(["not an image"], "fake.png", { type: "image/png" }),
    ),
    UploadError,
  );
  await assert.rejects(
    validateImage(new File(["<svg/>"], "fake.svg", { type: "image/svg+xml" })),
    UploadError,
  );
  await assert.rejects(
    validateImage(
      new File([new Uint8Array(MAX_COVER_BYTES + 1)], "large.png", {
        type: "image/png",
      }),
    ),
    (error: unknown) => error instanceof UploadError && error.status === 413,
  );
});

test("multipart and JSON requests enforce streamed limits and reject extra parts", async () => {
  const png = await sharp({
    create: { width: 4, height: 4, channels: 3, background: "red" },
  })
    .png()
    .toBuffer();
  const form = new FormData();
  form.append("input", JSON.stringify({ title: "Cover test" }));
  form.append(
    "cover",
    new File([new Uint8Array(png)], "cover.png", { type: "image/png" }),
  );
  const parsed = await readMutation(
    new Request("http://localhost", { method: "POST", body: form }),
  );
  assert.equal(parsed.input.title, "Cover test");
  assert.equal(parsed.image?.contentType, "image/png");
  form.append(
    "cover",
    new File([new Uint8Array(png)], "second.png", { type: "image/png" }),
  );
  await assert.rejects(
    readMutation(
      new Request("http://localhost", { method: "POST", body: form }),
    ),
    UploadError,
  );
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(65 * 1024));
      controller.close();
    },
  });
  await assert.rejects(
    readMutation(
      new Request("http://localhost", {
        method: "POST",
        body,
        duplex: "half",
      } as RequestInit),
    ),
    (error: unknown) => error instanceof UploadError && error.status === 413,
  );
});
