// Runs a command with DATABASE_URL built from the RDS-managed master secret.
//
//   node scripts/with-database-url.mjs <command> [args...]
//
// On AWS (DB_SECRET_ARN set): reads {username, password} from Secrets Manager
// through the instance role, builds the URL from DB_HOST, DB_PORT and DB_NAME,
// and passes it to the child process only. It is never written to disk, logged
// or placed in user data. DATABASE_CA_FILE is required, so the connection is
// always TLS with certificate and host name verification.
// Locally (DB_SECRET_ARN unset): runs the command with the environment as is.
import { spawn } from "node:child_process";
import { accessSync, constants } from "node:fs";
import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import { buildDatabaseUrl, databaseCaFile } from "./database-config.mjs";

const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error(
    "Usage: node scripts/with-database-url.mjs <command> [args...]",
  );
  process.exit(2);
}

async function environment() {
  const secretId = process.env.DB_SECRET_ARN?.trim();
  if (!secretId) return process.env;
  const caFile = databaseCaFile();
  if (!caFile)
    throw new Error("DATABASE_CA_FILE is required with DB_SECRET_ARN.");
  accessSync(caFile, constants.R_OK);
  const client = new SecretsManagerClient({
    region: process.env.AWS_REGION || "us-east-1",
    maxAttempts: 3,
  });
  const result = await client.send(
    new GetSecretValueCommand({ SecretId: secretId }),
    { abortSignal: AbortSignal.timeout(15_000) },
  );
  let secret;
  try {
    secret = JSON.parse(result.SecretString ?? "");
  } catch {
    throw new Error("The database secret is not valid JSON.");
  }
  return { ...process.env, DATABASE_URL: buildDatabaseUrl(secret) };
}

let env;
try {
  env = await environment();
} catch (error) {
  // AWS SDK messages name the secret but never contain its value.
  console.error(`with-database-url: ${error.message}`);
  process.exit(1);
}

const child = spawn(command, args, { env, stdio: "inherit" });
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"])
  process.on(signal, () => child.kill(signal));
child.on("error", (error) => {
  console.error(`with-database-url: ${error.message}`);
  process.exit(127);
});
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
