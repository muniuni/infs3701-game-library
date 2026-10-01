// Isolated SQLite and an in-process S3 protocol stub. Never uses real AWS.
import { createServer } from "node:http";
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const directory = mkdtempSync(join(tmpdir(), "game-library-e2e-"));
const objects = new Map();
const s3 = createServer(async (req, res) => {
  const key = req.url.split("?")[0];
  if (req.method === "PUT") {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    objects.set(key, {
      bytes: Buffer.concat(chunks),
      type: req.headers["content-type"],
    });
    res.writeHead(200, { ETag: '"test-etag"' }).end();
  } else if (req.method === "GET" && objects.has(key)) {
    const object = objects.get(key);
    res.writeHead(200, { "Content-Type": object.type }).end(object.bytes);
  } else if (req.method === "DELETE") {
    objects.delete(key);
    res.writeHead(204).end();
  } else res.writeHead(404).end();
});
await new Promise((resolve) => s3.listen(0, "127.0.0.1", resolve));
const env = {
  ...process.env,
  NODE_ENV: "production",
  STORAGE_MODE: "local",
  DATABASE_URL: `file:${join(directory, "library.sqlite")}`,
  S3_ENDPOINT: `http://127.0.0.1:${s3.address().port}`,
  S3_BUCKET: "test-covers",
  AWS_REGION: "us-east-1",
  AWS_ACCESS_KEY_ID: "local-test",
  AWS_SECRET_ACCESS_KEY: "local-test",
};
let child;
function close() {
  s3.close();
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
