// Isolated SQLite and local cover files. Never uses real AWS or the user's data.
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const directory = mkdtempSync(join(tmpdir(), "game-library-e2e-"));
const env = {
  ...process.env,
  NODE_ENV: "production",
  // Provider UI tests intercept requests; never use real credentials or APIs.
  STEAM_WEB_API_KEY: "",
  IGDB_CLIENT_ID: "",
  IGDB_CLIENT_SECRET: "",
  STORAGE_MODE: "local",
  DATABASE_URL: `file:${join(directory, "library.sqlite")}`,
  LOCAL_COVERS_DIR: join(directory, "covers"),
};
let child;
function close() {
  rmSync(directory, { recursive: true, force: true });
}
try {
  execFileSync("npm", ["run", "db:deploy"], { env, stdio: "inherit" });
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
  child.on("exit", (code) => {
    close();
    process.exit(code ?? 0);
  });
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () => child.kill(signal));
} catch (error) {
  close();
  throw error;
}
