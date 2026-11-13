import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildDatabaseUrl,
  databaseCaFile,
  pgPoolConfig,
  prismaDatasourceUrl,
} from "../scripts/database-config.mjs";

const env = {
  DB_HOST: "game-library.abc123.us-east-1.rds.amazonaws.com",
  DB_NAME: "game_library",
};
const certificate = (name: string) =>
  `-----BEGIN CERTIFICATE-----\n${name}\n-----END CERTIFICATE-----\n`;

async function withFiles(run: (dir: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), "database-config-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("RDS URL encodes every reserved character in the generated password", () => {
  const password = "p@ss:w/rd?#%& x[]$'";
  const url = buildDatabaseUrl({ username: "gl_admin", password }, env);
  const parsed = new URL(url);
  assert.equal(decodeURIComponent(parsed.password), password);
  assert.equal(parsed.username, "gl_admin");
  assert.equal(parsed.hostname, env.DB_HOST);
  assert.equal(parsed.port, "5432");
  assert.equal(parsed.pathname, "/game_library");
  assert.equal(parsed.search, "", "TLS comes from DATABASE_CA_FILE only");
  assert.equal(
    new URL(
      buildDatabaseUrl(
        { username: "u", password: "p" },
        { ...env, DB_PORT: "6543" },
      ),
    ).port,
    "6543",
  );
});

test("RDS URL rejects incomplete secrets and environment", () => {
  for (const secret of [
    null,
    "text",
    {},
    { username: "u" },
    { password: "p" },
    { username: "u", password: "" },
  ])
    assert.throws(() => buildDatabaseUrl(secret, env), /secret has no/);
  assert.throws(
    () => buildDatabaseUrl({ username: "u", password: "p" }, { DB_HOST: "h" }),
    /DB_HOST and DB_NAME/,
  );
  assert.throws(
    () =>
      buildDatabaseUrl(
        { username: "u", password: "p" },
        { ...env, DB_PORT: "5432x" },
      ),
    /DB_PORT/,
  );
});

test("without a CA file both clients get the URL unchanged", () => {
  const url = "postgresql://u:p@localhost:5432/db?sslmode=disable";
  assert.deepEqual(pgPoolConfig(url, undefined), { connectionString: url });
  assert.equal(prismaDatasourceUrl(url, undefined), url);
  assert.equal(prismaDatasourceUrl(undefined, "/ca.pem"), undefined);
  assert.equal(databaseCaFile({ DATABASE_CA_FILE: " " }), undefined);
  assert.equal(
    databaseCaFile({ DATABASE_CA_FILE: "/etc/ca.pem" }),
    "/etc/ca.pem",
  );
});

test("with a CA file, pg verifies in code and Prisma gets strict TLS syntax", async () => {
  await withFiles(async (dir) => {
    const ca = join(dir, "rds-ca.pem");
    await writeFile(ca, certificate("one"));
    const url = "postgresql://u:p%40ss@db.example.com:5432/game_library";
    assert.deepEqual(pgPoolConfig(url, ca), {
      connectionString: url,
      ssl: { ca: certificate("one"), rejectUnauthorized: true },
    });
    const prisma = new URL(prismaDatasourceUrl(url, ca)!);
    assert.equal(prisma.searchParams.get("sslmode"), "require");
    assert.equal(prisma.searchParams.get("sslaccept"), "strict");
    assert.equal(prisma.searchParams.get("sslcert"), ca);
    assert.equal(prisma.password, "p%40ss");
  });
});

test("URL TLS parameters are refused when they would override the CA file", async () => {
  await withFiles(async (dir) => {
    const ca = join(dir, "rds-ca.pem");
    await writeFile(ca, certificate("one"));
    for (const query of [
      "sslmode=verify-full",
      "sslrootcert=/x",
      "ssl=true",
      "sslaccept=accept_invalid_certs",
    ]) {
      const url = `postgresql://u:p@db.example.com/db?${query}`;
      assert.throws(() => pgPoolConfig(url, ca), /must not set/);
      assert.throws(() => prismaDatasourceUrl(url, ca), /must not set/);
    }
  });
});

test("Prisma refuses a multi-certificate bundle, which its engine can't read", async () => {
  await withFiles(async (dir) => {
    const bundle = join(dir, "bundle.pem");
    await writeFile(bundle, certificate("one") + certificate("two"));
    assert.throws(
      () => prismaDatasourceUrl("postgresql://u:p@h/db", bundle),
      /exactly one certificate .*found 2/,
    );
    // node-postgres reads bundles correctly.
    assert.equal(
      (pgPoolConfig("postgresql://u:p@h/db", bundle).ssl as { ca: string }).ca,
      certificate("one") + certificate("two"),
    );
  });
});
