// PostgreSQL connection settings shared by the app (pg adapter), Prisma Migrate
// (prisma.config.ts) and the AWS wrapper (with-database-url.mjs).
//
// TLS is configured from DATABASE_CA_FILE, never from DATABASE_URL, because the
// two clients disagree on URL TLS parameters (tested against a TLS-only Docker
// PostgreSQL with a self-signed CA, see docs/GROUP_ARCHITECTURE.md §6):
// - node-postgres lets `sslmode`/`sslrootcert` in the URL silently replace the
//   `ssl` object passed in code.
// - Prisma's schema engine treats `sslmode=verify-full` as no verification at
//   all, accepts any certificate unless `sslaccept=strict` is set, and reads
//   only a single certificate from `sslcert` (a multi-certificate bundle fails).
import { readFileSync } from "node:fs";

const TLS_PARAMETERS = [
  "ssl",
  "sslmode",
  "sslrootcert",
  "sslcert",
  "sslkey",
  "sslaccept",
  "sslidentity",
  "sslpassword",
  "uselibpqcompat",
];

/** @param {Record<string, string | undefined>} env */
export function databaseCaFile(env = process.env) {
  return env.DATABASE_CA_FILE?.trim() || undefined;
}

/** Rejects URL TLS parameters, which would override DATABASE_CA_FILE. */
export function assertNoUrlTls(url) {
  const found = TLS_PARAMETERS.filter((key) =>
    new URL(url).searchParams.has(key),
  );
  if (found.length)
    throw new Error(
      `DATABASE_URL must not set ${found.join(", ")} when DATABASE_CA_FILE is set.`,
    );
}

/**
 * Builds the RDS connection URL from the RDS-managed master secret, which holds
 * only `username` and `password`. Host, port and database come from the env
 * file written at boot. The result stays in memory.
 * @param {unknown} secret parsed SecretString
 * @param {Record<string, string | undefined>} env
 */
export function buildDatabaseUrl(secret, env = process.env) {
  const { username, password } = /** @type {Record<string, unknown>} */ (
    secret && typeof secret === "object" ? secret : {}
  );
  if (typeof username !== "string" || !username)
    throw new Error("The database secret has no username.");
  if (typeof password !== "string" || !password)
    throw new Error("The database secret has no password.");
  const host = env.DB_HOST?.trim();
  const name = env.DB_NAME?.trim();
  const port = env.DB_PORT?.trim() || "5432";
  if (!host || !name) throw new Error("DB_HOST and DB_NAME are required.");
  if (!/^\d+$/.test(port)) throw new Error("DB_PORT must be a number.");
  const url = new URL("postgresql://placeholder");
  url.hostname = host;
  url.port = port;
  url.pathname = `/${encodeURIComponent(name)}`;
  // Encode explicitly: the URL setters leave some characters (such as %) as is.
  url.username = encodeURIComponent(username);
  url.password = encodeURIComponent(password);
  return url.href;
}

/**
 * node-postgres pool options. With a CA file, the server certificate must chain
 * to that CA and match the host name (Node's default identity check).
 * @param {string} url
 * @param {string | undefined} caFile
 */
export function pgPoolConfig(url, caFile) {
  if (!caFile) return { connectionString: url };
  assertNoUrlTls(url);
  return {
    connectionString: url,
    ssl: { ca: readFileSync(caFile, "utf8"), rejectUnauthorized: true },
  };
}

/**
 * The URL Prisma Migrate (schema engine) uses, in Prisma's own TLS syntax.
 * `sslaccept=strict` is required: without it Prisma accepts any certificate.
 * The CA file must contain exactly one certificate (infra/select-db-ca.sh).
 * @param {string | undefined} url
 * @param {string | undefined} caFile
 */
export function prismaDatasourceUrl(url, caFile) {
  if (!url || !caFile) return url;
  assertNoUrlTls(url);
  const certificates =
    readFileSync(caFile, "utf8").match(/-----BEGIN CERTIFICATE-----/g)
      ?.length ?? 0;
  if (certificates !== 1)
    throw new Error(
      `DATABASE_CA_FILE must contain exactly one certificate for Prisma Migrate (found ${certificates}).`,
    );
  const parsed = new URL(url);
  parsed.searchParams.set("sslmode", "require");
  parsed.searchParams.set("sslaccept", "strict");
  parsed.searchParams.set("sslcert", caFile);
  return parsed.href;
}
