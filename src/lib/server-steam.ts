// Server-only: never send the Web API key or upstream URLs to the browser.
import { serverSecrets } from "./server-secrets";
import { z } from "zod";
import { steamOwnedSchema, type SteamOwned } from "./steam";
export class SteamError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}
export function steamAccount(value: string): { id?: string; vanity?: string } {
  const text = value.trim();
  const validId = (id: string) => /^7656119\d{10}$/.test(id);
  if (validId(text)) return { id: text }; // Keep ID64 as a string, never a JS number.
  try {
    const url = new URL(text);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "steamcommunity.com" ||
      url.port ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new Error();
    const match = url.pathname.match(/^\/(profiles|id)\/([A-Za-z0-9_-]+)\/?$/);
    if (match?.[1] === "profiles" && validId(match[2])) return { id: match[2] };
    if (match?.[1] === "id" && match[2].length <= 100)
      return { vanity: match[2] };
  } catch {
    /* Invalid input is handled below. */
  }
  throw new SteamError(
    "Enter a Steam ID64 or a steamcommunity.com profile URL.",
    400,
  );
}
export function normalizeOwned(value: unknown): SteamOwned[] {
  const parsed = z
    .object({
      response: z.object({
        game_count: z.number().int().nonnegative().max(20000).optional(),
        games: z
          .array(
            z.object({
              appid: z.number(),
              name: z.string(),
              playtime_forever: z.number().optional(),
            }),
          )
          .max(20000)
          .optional(),
      }),
    })
    .safeParse(value);
  if (!parsed.success)
    throw new SteamError("Steam returned invalid library data. Try again.");
  const { game_count: count, games } = parsed.data.response;
  if (count === 0 && (!games || games.length === 0)) return [];
  if (!games || count === undefined || games.length !== count)
    throw new SteamError(
      "Game details are unavailable. Set Steam game details to Public, then try again.",
      403,
    );
  const result = games.map((game) =>
    steamOwnedSchema.safeParse({
      appId: game.appid,
      title: game.name,
      playtimeMinutes: game.playtime_forever,
    }),
  );
  if (result.some((row) => !row.success))
    throw new SteamError(
      "Steam returned a game that cannot be imported. Try again.",
    );
  return [
    ...new Map(
      result
        .filter((row) => row.success)
        .map((row) => [row.data.appId, row.data]),
    ).values(),
  ];
}
export function createSteamClient(
  options: {
    key?: () => string | undefined | Promise<string | undefined>;
    fetch?: typeof fetch;
    wait?: (ms: number) => Promise<void>;
  } = {},
) {
  const fetcher = options.fetch ?? fetch;
  const wait =
    options.wait ??
    ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  async function query(
    path: string,
    params: Record<string, string>,
    signal?: AbortSignal,
  ) {
    signal?.throwIfAborted();
    const key = await Promise.resolve()
      .then(options.key ?? serverSecrets.steam)
      .catch(() => {
        throw new SteamError(
          "Steam credentials are unavailable. Try again shortly.",
          503,
        );
      });
    signal?.throwIfAborted();
    if (!key)
      throw new SteamError(
        "Steam import is not configured on the server.",
        503,
      );
    const url = new URL(`https://api.steampowered.com/${path}/v1/`);
    url.search = new URLSearchParams({ key, ...params }).toString();
    for (let attempt = 0; attempt < 2; attempt++) {
      signal?.throwIfAborted();
      try {
        const response = await fetcher(url, {
          cache: "no-store",
          redirect: "error",
          signal: AbortSignal.any([
            AbortSignal.timeout(15000),
            ...(signal ? [signal] : []),
          ]),
        });
        if (!response.ok) {
          await response.body?.cancel();
          if (
            (response.status === 429 || response.status >= 500) &&
            attempt === 0
          ) {
            await wait(1000);
            continue;
          }
          throw new SteamError(
            response.status === 401 || response.status === 403
              ? "Steam access failed. Check the server API key and profile privacy settings."
              : "Steam is unavailable. Try again shortly.",
            response.status === 429 ? 429 : 502,
          );
        }
        const reader = response.body?.getReader();
        if (!reader) throw new Error();
        const chunks: Uint8Array[] = [];
        let size = 0;
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.length;
            if (size > 8 * 1024 * 1024)
              throw new SteamError(
                "This Steam library exceeds the import limit.",
                413,
              );
            chunks.push(value);
          }
        } finally {
          await reader.cancel().catch(() => {});
        }
        return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
      } catch (error) {
        if (error instanceof SteamError) throw error;
        if (signal?.aborted)
          throw new SteamError("Steam request cancelled.", 499);
        throw new SteamError("Unable to reach Steam. Try again.");
      }
    }
    throw new SteamError("Steam is unavailable. Try again.");
  }
  return {
    async library(account: string, signal?: AbortSignal) {
      const parsed = steamAccount(account);
      let id = parsed.id;
      if (!id) {
        const result = z
          .object({
            response: z.object({
              success: z.number(),
              steamid: z.string().optional(),
            }),
          })
          .safeParse(
            await query(
              "ISteamUser/ResolveVanityURL",
              { vanityurl: parsed.vanity! },
              signal,
            ),
          );
        if (
          !result.success ||
          result.data.response.success !== 1 ||
          !result.data.response.steamid
        )
          throw new SteamError("Steam profile not found.", 404);
        id = steamAccount(result.data.response.steamid).id!;
      }
      const games = normalizeOwned(
        await query(
          "IPlayerService/GetOwnedGames",
          {
            steamid: id,
            include_appinfo: "true",
            include_played_free_games: "true",
          },
          signal,
        ),
      );
      return { steamId: id, games };
    },
  };
}
export const steamClient = createSteamClient();
