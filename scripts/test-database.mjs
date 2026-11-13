// Disposable PostgreSQL databases for unit and e2e tests.
// Each call creates a fresh, uniquely named database on the local server,
// applies the migrations with Prisma Migrate, and returns a drop function.
// Never point TEST_DATABASE_URL at a database whose data you need.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { LOCAL_DATABASE_URL } from "./storage-config.mjs";

const serverUrl = () => process.env.TEST_DATABASE_URL || LOCAL_DATABASE_URL;

async function admin(sql) {
  const client = new pg.Client({ connectionString: serverUrl() });
  try {
    await client.connect();
  } catch (error) {
    throw new Error(
      "Cannot reach the test PostgreSQL server. Start it with `docker compose up -d --wait`.",
      { cause: error },
    );
  }
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

/**
 * @param {string} prefix
 * @param {{ fixedName?: boolean }} options fixedName reuses one name and
 *   recreates it, so a run killed before its drop leaves at most one database.
 */
export async function createTestDatabase(prefix = "test", options = {}) {
  const name = options.fixedName
    ? `game_library_${prefix}`
    : `game_library_${prefix}_${randomUUID().replaceAll("-", "")}`;
  if (options.fixedName)
    await admin(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await admin(`CREATE DATABASE "${name}"`);
  const url = new URL(serverUrl());
  url.pathname = `/${name}`;
  const drop = () => admin(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  try {
    execFileSync(
      process.execPath,
      ["node_modules/prisma/build/index.js", "migrate", "deploy"],
      { stdio: "pipe", env: { ...process.env, DATABASE_URL: url.href } },
    );
  } catch (error) {
    await drop();
    throw error;
  }
  return { url: url.href, drop };
}
