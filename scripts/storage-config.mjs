// Default for the local Docker PostgreSQL in compose.yaml. Local only.
export const LOCAL_DATABASE_URL =
  "postgresql://game_library:game_library@localhost:5432/game_library";

/**
 * STORAGE_MODE only chooses where covers live: local files or S3.
 * The database is always PostgreSQL, located by DATABASE_URL.
 * @param {Record<string, string | undefined>} env
 */
export function storageConfig(env = process.env) {
  const production = env.NODE_ENV === "production";
  const mode = env.STORAGE_MODE || (production ? "s3" : "local");
  if (!["local", "s3"].includes(mode))
    throw new Error("STORAGE_MODE must be local or s3.");
  // Production has no default: the RDS URL is built at runtime (S2 wrapper).
  const url = env.DATABASE_URL || (production ? undefined : LOCAL_DATABASE_URL);
  if (url && !/^postgres(ql)?:\/\//.test(url))
    throw new Error("DATABASE_URL must be a postgresql:// connection URL.");
  return { mode, url };
}

/** @param {Record<string, string | undefined>} env */
export function assertStorage(env = process.env) {
  const config = storageConfig(env);
  if (!config.url) throw new Error("DATABASE_URL is required in production.");
  return { ...config, url: config.url };
}

/** Host, port and database for logs. Never includes credentials. */
export function describeDatabase(url) {
  const parsed = new URL(url);
  return `${parsed.hostname}:${parsed.port || 5432}${parsed.pathname}`;
}
