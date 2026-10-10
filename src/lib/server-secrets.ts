// Node-only credentials. Import only from server modules, never client components.
import process from "node:process";
import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";

const definitions = {
  igdb: {
    id: "infs3701/game-library/igdb",
    keys: ["IGDB_CLIENT_ID", "IGDB_CLIENT_SECRET"],
  },
  steam: {
    id: "infs3701/game-library/steam",
    keys: ["STEAM_WEB_API_KEY"],
  },
} as const;
type Provider = keyof typeof definitions;
const CACHE_MS = 5 * 60 * 1000;

export function createSecretLoader(
  options: {
    env?: Readonly<Record<string, string | undefined>>;
    now?: () => number;
    read?: (secretId: string) => Promise<string | undefined>;
  } = {},
) {
  const env = options.env ?? process.env;
  const now = options.now ?? Date.now;
  let client: SecretsManagerClient | undefined;
  const read =
    options.read ??
    (async (secretId: string) => {
      // The default credential chain uses the EC2 instance role on deployment.
      client ??= new SecretsManagerClient({
        region: "us-east-1",
        maxAttempts: 2,
      });
      const result = await client.send(
        new GetSecretValueCommand({ SecretId: secretId }),
        { abortSignal: AbortSignal.timeout(8000) },
      );
      return result.SecretString;
    });
  const cache = new Map<
    Provider,
    { value: Record<string, string>; expiresAt: number }
  >();
  const pending = new Map<Provider, Promise<Record<string, string>>>();

  async function get(provider: Provider): Promise<Record<string, string>> {
    const source =
      env.SECRETS_SOURCE ?? (env.NODE_ENV === "production" ? "aws" : "env");
    const definition = definitions[provider];
    if (source === "env") {
      return Object.fromEntries(
        definition.keys.map((key) => [key, env[key]?.trim() ?? ""]),
      );
    }
    if (source !== "aws") throw new Error("Invalid server credential source.");
    const cached = cache.get(provider);
    if (cached && cached.expiresAt > now()) return cached.value;
    const existing = pending.get(provider);
    if (existing) return existing;
    const request = (async () => {
      try {
        const raw = await read(definition.id);
        const parsed: unknown = JSON.parse(raw ?? "");
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
          throw new Error();
        const value: Record<string, string> = {};
        for (const key of definition.keys) {
          const entry = (parsed as Record<string, unknown>)[key];
          if (typeof entry !== "string" || !entry.trim()) throw new Error();
          value[key] = entry.trim();
        }
        cache.set(provider, { value, expiresAt: now() + CACHE_MS });
        return value;
      } catch {
        // Never expose AWS errors, secret contents or stale credentials on failure.
        cache.delete(provider);
        throw new Error("Server credentials are unavailable.");
      }
    })();
    pending.set(provider, request);
    try {
      return await request;
    } finally {
      pending.delete(provider);
    }
  }
  return {
    async igdb() {
      const value = await get("igdb");
      return {
        clientId: value.IGDB_CLIENT_ID,
        clientSecret: value.IGDB_CLIENT_SECRET,
      };
    },
    async steam() {
      return (await get("steam")).STEAM_WEB_API_KEY;
    },
  };
}

// Share the cache across Next.js route bundles. No I/O until a provider is used.
const globalSecrets = globalThis as typeof globalThis & {
  gameLibrarySecrets?: ReturnType<typeof createSecretLoader>;
};
export const serverSecrets = (globalSecrets.gameLibrarySecrets ??=
  createSecretLoader());
