// Node-only provider client. Import only from API routes/server code.
import process from "node:process";
import { z } from "zod";
import { updateGameSchema } from "./game";
import { igdbGameSchema, type IgdbGame } from "./igdb";

export class IgdbError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}
export const searchQuerySchema = z
  .string()
  .trim()
  .min(1, "Enter a game title.")
  .max(160)
  .refine(
    (value) => !/[\u0000-\u001f\u007f]/.test(value),
    "Enter a valid game title.",
  );
export const igdbIdSchema = z
  .string()
  .regex(/^[1-9]\d*$/)
  .transform(Number)
  .pipe(z.number().int().positive().safe());
const releaseSchema = z.object({
  date: z.number().int().optional(),
  date_format: z.object({ format: z.string() }).optional(),
});
const providerGameSchema = z.object({
  id: z.number().int().positive().safe(),
  name: z.string(),
  first_release_date: z.number().int().optional(),
  release_dates: z.array(releaseSchema).optional(),
  cover: z.object({ image_id: z.string() }).optional(),
  genres: z.array(z.object({ name: z.string() })).optional(),
  platforms: z.array(z.object({ id: z.number(), name: z.string() })).optional(),
  involved_companies: z
    .array(
      z.object({
        company: z.object({ name: z.string() }),
        developer: z.boolean().optional(),
        publisher: z.boolean().optional(),
      }),
    )
    .optional(),
  summary: z.string().optional(),
  storyline: z.string().optional(),
  screenshots: z.array(z.object({ image_id: z.string() })).optional(),
});
export function normalizeIgdbGames(value: unknown): IgdbGame[] {
  const rows = z.array(providerGameSchema).max(20).safeParse(value);
  if (!rows.success)
    throw new IgdbError("IGDB returned invalid data. Please try again.");
  return rows.data
    .map((row) => {
      const first =
        row.first_release_date === undefined
          ? undefined
          : new Date(row.first_release_date * 1000);
      const validDate =
        first &&
        !Number.isNaN(first.getTime()) &&
        /^\d{4}-/.test(first.toISOString());
      const fullDate = row.release_dates?.some(
        (release) =>
          release.date === row.first_release_date &&
          ["YYYYMMMMDD", "YYYYMMDD"].includes(
            (release.date_format?.format ?? "")
              .replace(/[^A-Za-z]/g, "")
              .toUpperCase(),
          ),
      );
      const releaseDate =
        validDate && fullDate ? first.toISOString().slice(0, 10) : undefined;
      const imageId = row.cover?.image_id;
      const cover =
        imageId && /^[A-Za-z0-9_]+$/.test(imageId)
          ? {
              type: "url" as const,
              url: `https://images.igdb.com/igdb/image/upload/t_cover_big/${imageId}.jpg`,
            }
          : undefined;
      const tagsInput = row.genres?.map((genre) => genre.name);
      const tags =
        tagsInput?.length &&
        updateGameSchema.safeParse({ tags: tagsInput }).success
          ? updateGameSchema.parse({ tags: tagsInput }).tags
          : undefined;
      const extra: Record<string, unknown> = {};
      const candidates = {
        availablePlatforms: row.platforms,
        developers: row.involved_companies
          ?.filter((company) => company.developer)
          .map((company) => company.company.name),
        publishers: row.involved_companies
          ?.filter((company) => company.publisher)
          .map((company) => company.company.name),
        summary: row.summary,
        storyline: row.storyline,
        screenshots: row.screenshots
          ?.filter((image) => /^[A-Za-z0-9_]+$/.test(image.image_id))
          .slice(0, 30)
          .map((image) => ({ imageId: image.image_id })),
      };
      for (const [field, value] of Object.entries(candidates)) {
        if (value === undefined) continue;
        const parsed = updateGameSchema.safeParse({ [field]: value });
        if (parsed.success) Object.assign(extra, parsed.data);
      }
      const parsed = igdbGameSchema.safeParse({
        ...extra,
        id: row.id,
        title: row.name,
        releaseYear: validDate ? first.getUTCFullYear() : undefined,
        releaseDate,
        cover,
        tags,
      });
      return parsed.success ? parsed.data : undefined;
    })
    .filter((game): game is IgdbGame => game !== undefined);
}
const searchFields =
  "fields name,first_release_date,cover.image_id,platforms.name;";
const fields =
  "fields name,first_release_date,release_dates.date,release_dates.date_format.format,cover.image_id,genres.name,platforms.name,involved_companies.company.name,involved_companies.developer,involved_companies.publisher,summary,storyline,screenshots.image_id;";
type Options = {
  credentials?: () => { clientId?: string; clientSecret?: string };
  fetch?: typeof fetch;
  now?: () => number;
  wait?: (ms: number) => Promise<void>;
};
export function createIgdbClient(options: Options = {}) {
  const credentials =
    options.credentials ??
    (() => ({
      clientId: process.env.IGDB_CLIENT_ID,
      clientSecret: process.env.IGDB_CLIENT_SECRET,
    }));
  const fetcher = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const wait =
    options.wait ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  let token:
    | {
        value: string;
        expiresAt: number;
        clientId: string;
        clientSecret: string;
      }
    | undefined;
  let queue = Promise.resolve();
  let pending = 0;
  let lastRequest = -Infinity;
  async function jsonRequest(
    url: string,
    init: RequestInit,
    signal?: AbortSignal,
  ) {
    try {
      const response = await fetcher(url, {
        ...init,
        cache: "no-store",
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(8000)])
          : AbortSignal.timeout(8000),
        redirect: "error",
      });
      if (!response.ok) {
        await response.body?.cancel();
        return { response, data: undefined };
      }
      // Bound provider data before JSON parsing; the timeout also covers reading the body.
      const reader = response.body?.getReader();
      if (!reader) throw new Error();
      let size = 0;
      const chunks: Uint8Array[] = [];
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > 1024 * 1024) throw new Error();
          chunks.push(value);
        }
      } finally {
        await reader.cancel().catch(() => {});
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      return {
        response,
        data: JSON.parse(new TextDecoder().decode(bytes)) as unknown,
      };
    } catch {
      throw new IgdbError(
        "Unable to reach IGDB. Please try again or enter the game manually.",
      );
    }
  }
  async function accessToken(clientId: string, clientSecret: string) {
    if (
      token &&
      token.clientId === clientId &&
      token.clientSecret === clientSecret &&
      token.expiresAt > now()
    )
      return token.value;
    const { response, data } = await jsonRequest(
      "https://id.twitch.tv/oauth2/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: "client_credentials",
        }),
      },
    );
    const parsed = z
      .object({
        access_token: z.string().min(1),
        expires_in: z.number().positive(),
      })
      .safeParse(data);
    if (!response.ok || !parsed.success)
      throw new IgdbError(
        "IGDB authentication failed. Check the server's Twitch application credentials.",
        503,
      );
    token = {
      value: parsed.data.access_token,
      expiresAt: now() + Math.max(0, parsed.data.expires_in * 1000 - 60000),
      clientId,
      clientSecret,
    };
    return token.value;
  }
  async function query(
    body: string,
    signal?: AbortSignal,
  ): Promise<IgdbGame[]> {
    signal?.throwIfAborted();
    const { clientId, clientSecret } = credentials();
    if (!clientId || !clientSecret)
      throw new IgdbError(
        "Game search is not configured. Continue manually.",
        503,
      );
    if (pending >= 20)
      throw new IgdbError(
        "IGDB search is busy. Please try again shortly.",
        429,
      );
    pending++;
    let counted = true;
    const release = () => {
      if (counted) {
        pending--;
        counted = false;
      }
    };
    signal?.addEventListener("abort", release, { once: true });
    const task = queue.then(async () => {
      let authRetried = false,
        transientRetried = false;
      while (true) {
        signal?.throwIfAborted();
        const access = await accessToken(clientId, clientSecret);
        await wait(Math.max(0, 260 - (now() - lastRequest)));
        signal?.throwIfAborted();
        lastRequest = now();
        const { response, data } = await jsonRequest(
          "https://api.igdb.com/v4/games",
          {
            method: "POST",
            headers: {
              "Client-ID": clientId,
              Authorization: `Bearer ${access}`,
              "Content-Type": "text/plain",
              Accept: "application/json",
            },
            body,
          },
          signal,
        );
        if (response.status === 401 && !authRetried) {
          authRetried = true;
          token = undefined;
          continue;
        }
        if (
          (response.status === 429 || response.status >= 500) &&
          !transientRetried
        ) {
          transientRetried = true;
          const retryAfter = Number(response.headers.get("Retry-After"));
          await wait(
            Number.isFinite(retryAfter) && retryAfter > 0
              ? Math.min(2000, retryAfter * 1000)
              : 1000,
          );
          continue;
        }
        if (!response.ok)
          throw new IgdbError(
            response.status === 429
              ? "IGDB is rate limited. Please try again shortly."
              : "IGDB search failed. Please try again or enter the game manually.",
            response.status === 429 ? 429 : 502,
          );
        return normalizeIgdbGames(data);
      }
    });
    queue = task.then(
      () => {},
      () => {},
    );
    try {
      return await task;
    } finally {
      release();
      signal?.removeEventListener("abort", release);
    }
  }
  return {
    search: (search: string, signal?: AbortSignal) =>
      query(
        `${searchFields} search ${JSON.stringify(searchQuerySchema.parse(search))}; limit 20;`,
        signal,
      ),
    async get(id: string, signal?: AbortSignal) {
      return (
        await query(
          `${fields} where id = ${igdbIdSchema.parse(id)}; limit 1;`,
          signal,
        )
      )[0];
    },
  };
}
const processState = globalThis as typeof globalThis & {
  gameLibraryIgdbClient?: ReturnType<typeof createIgdbClient>;
};
export const igdbClient = (processState.gameLibraryIgdbClient ??=
  createIgdbClient());
export function igdbApiError(error: unknown) {
  const status =
    error instanceof IgdbError
      ? error.status
      : error instanceof z.ZodError
        ? 400
        : 502;
  const message =
    error instanceof IgdbError
      ? error.message
      : error instanceof z.ZodError
        ? "Enter a valid game title or IGDB ID."
        : "IGDB search failed. Please try again.";
  return Response.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
