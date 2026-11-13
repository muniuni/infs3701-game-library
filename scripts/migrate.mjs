import "dotenv/config";
import { execFileSync } from "node:child_process";
import { assertStorage, describeDatabase } from "./storage-config.mjs";
const { url } = assertStorage();
console.log(`Applying migrations to ${describeDatabase(url)}`);
// Prisma Migrate takes a PostgreSQL advisory lock, so concurrent runs are safe.
execFileSync(
  process.execPath,
  ["node_modules/prisma/build/index.js", "migrate", "deploy"],
  {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url },
  },
);
