// Isolated PostgreSQL database and local cover files. Never uses real AWS or
// the user's data. Needs the local Docker PostgreSQL (compose.yaml).
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTestDatabase } from "./test-database.mjs";
const directory = mkdtempSync(join(tmpdir(), "game-library-e2e-"));
let database;
let child;
async function close() {
  rmSync(directory, { recursive: true, force: true });
  await database?.drop().catch((error) => console.error(error));
}
try {
  // Playwright may stop this process before the drop finishes; the fixed name
  // means the next run replaces any leftover database.
  database = await createTestDatabase("e2e", { fixedName: true });
  const env = {
    ...process.env,
    NODE_ENV: "production",
    SECRETS_SOURCE: "env",
    // Provider UI tests intercept requests; never use real credentials or APIs.
    STEAM_WEB_API_KEY: "",
    IGDB_CLIENT_ID: "",
    IGDB_CLIENT_SECRET: "",
    STORAGE_MODE: "local",
    DATABASE_URL: database.url,
    LOCAL_COVERS_DIR: join(directory, "covers"),
  };
  child = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      process.env.PLAYWRIGHT_PORT || "3101",
    ],
    { env, stdio: "inherit" },
  );
  child.on("exit", async (code) => {
    await close();
    process.exit(code ?? 0);
  });
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () => child.kill(signal));
} catch (error) {
  await close();
  throw error;
}
