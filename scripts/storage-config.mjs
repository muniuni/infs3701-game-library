import { mkdirSync, realpathSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";

/** @param {Record<string, string | undefined>} env */
export function storageConfig(env = process.env) {
  const mode =
    env.STORAGE_MODE || (env.NODE_ENV === "production" ? "ebs" : "local");
  if (!["local", "ebs"].includes(mode))
    throw new Error("STORAGE_MODE must be local or ebs.");
  const url =
    env.DATABASE_URL ||
    (mode === "ebs"
      ? "file:/mnt/game-library-data/game-library.sqlite"
      : `file:${resolve("data/game-library.sqlite")}`);
  if (!url.startsWith("file:/") || url.includes("?") || url.includes("#"))
    throw new Error(
      "DATABASE_URL must be an absolute file: path without query parameters.",
    );
  return { mode, url, path: url.slice(5) };
}

/** @param {Record<string, string | undefined>} env */
export function assertStorage(env = process.env) {
  const config = storageConfig(env);
  if (config.mode === "ebs") {
    const mount = "/mnt/game-library-data";
    if (config.path !== `${mount}/game-library.sqlite`)
      throw new Error(
        "EBS mode requires /mnt/game-library-data/game-library.sqlite.",
      );
    if (process.platform !== "linux" || !env.EBS_VOLUME_UUID)
      throw new Error("EBS mode requires Linux and EBS_VOLUME_UUID.");
    const uuid = execFileSync(
      "findmnt",
      ["--noheadings", "--raw", "--mountpoint", mount, "--output", "UUID"],
      { encoding: "utf8" },
    ).trim();
    if (
      uuid !== env.EBS_VOLUME_UUID ||
      realpathSync(mount) !== mount ||
      statSync(mount).dev === statSync("/").dev
    )
      throw new Error(
        "Expected separate EBS filesystem is not mounted. Refusing to open SQLite.",
      );
  } else mkdirSync(dirname(config.path), { recursive: true });
  return config;
}
