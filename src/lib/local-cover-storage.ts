import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { CoverStorage, ImageUpload } from "./cover-storage";

const formats = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

export class LocalCoverStorage implements CoverStorage {
  private directory: string;
  constructor(directory = resolve("data/covers")) {
    this.directory = resolve(directory);
  }
  private filename(key: string, extension: string) {
    if (!/^covers\/[0-9a-f-]{36}$/.test(key))
      throw new Error("Invalid cover key.");
    return join(this.directory, `${key.slice(7)}.${extension}`);
  }
  async put(key: string, image: ImageUpload) {
    const extension = formats[image.contentType as keyof typeof formats];
    if (!extension) throw new Error("Unsupported cover content type.");
    const filename = this.filename(key, extension);
    await mkdir(this.directory, { recursive: true });
    // The pending ledger exists before writing; partial files remain eligible
    // for cleanup after a crash. Images are served only after the game commits.
    await writeFile(filename, image.bytes, { flag: "wx", mode: 0o600 });
  }
  async get(key: string): Promise<ImageUpload> {
    for (const [contentType, extension] of Object.entries(formats)) {
      try {
        return {
          bytes: await readFile(this.filename(key, extension)),
          contentType,
        };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    throw new Error("Cover file not found.");
  }
  async delete(key: string) {
    await Promise.all(
      Object.values(formats).map((extension) =>
        rm(this.filename(key, extension), { force: true }),
      ),
    );
  }
}
