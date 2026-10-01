import "dotenv/config";
import { closeSync, openSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { assertStorage } from "./storage-config.mjs";
const { path, url } = assertStorage();
// Create only after the mount guard. This also avoids Prisma's intermittent
// schema-engine failure when deploying to a nonexistent SQLite file on macOS.
closeSync(openSync(path, "a", 0o600));
execFileSync(
  process.execPath,
  ["node_modules/prisma/build/index.js", "migrate", "deploy"],
  {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url },
  },
);
