import { z } from "zod";
import {
  statuses,
  createGameSchema,
  updateGameSchema,
  type Game,
  type UpdateGameInput,
} from "./game";
import {
  igdbGameSchema,
  metadataFields,
  metadataLabels,
  isEmpty,
  mergeIgdbTags,
  type IgdbGame,
  type MetadataDraft,
} from "./igdb";

export const steamFields = [
  ...metadataFields,
  "platforms",
  "playtimeMinutes",
] as const;
export type SteamField = (typeof steamFields)[number];
export const steamLabels = {
  ...metadataLabels,
  platforms: "Platforms",
  playtimeMinutes: "Playtime",
};
export const steamOwnedSchema = z
  .object({
    appId: z.number().int().positive().max(4294967295),
    title: z.string().trim().min(1).max(160),
    playtimeMinutes: z.number().int().nonnegative().safe().optional(),
  })
  .strict();
export type SteamOwned = z.infer<typeof steamOwnedSchema>;
const choicesSchema = z
  .object(
    Object.fromEntries(
      steamFields.map((field) => [field, z.boolean().optional()]),
    ) as Record<SteamField, z.ZodOptional<z.ZodBoolean>>,
  )
  .strict();
export type SteamChoices = Partial<Record<SteamField, boolean>>;
export const steamPreferencesSchema = z
  .object({
    mode: z.enum(["empty", "replace", "manual"]),
    fields: choicesSchema,
  })
  .strict();
export type SteamPreferences = z.infer<typeof steamPreferencesSchema>;
export const defaultSteamPreferences: SteamPreferences = {
  mode: "empty",
  fields: {},
};
export const steamEntrySchema = z
  .object({
    operationId: z.string().uuid(),
    steam: steamOwnedSchema,
    igdb: igdbGameSchema.optional(),
    targetId: z.string().uuid().optional(),
    expectedUpdatedAt: z.string().datetime().optional(),
    choices: choicesSchema,
    status: z.enum(statuses).optional(),
  })
  .strict()
  .refine(
    (value) => !!value.targetId === !!value.expectedUpdatedAt,
    "Reload the library before importing.",
  );
export type SteamEntry = z.infer<typeof steamEntrySchema>;

export function asMetadata(game?: Game): MetadataDraft {
  return {
    title: game?.title ?? "",
    releaseDate: game?.releaseDate ?? "",
    cover: game?.cover ?? { type: "placeholder" },
    tags: game?.tags ?? [],
    developers: game?.developers ?? [],
    publishers: game?.publishers ?? [],
    summary: game?.summary ?? "",
    storyline: game?.storyline ?? "",
    screenshots: game?.screenshots ?? [],
    availablePlatforms: game?.availablePlatforms ?? [],
  };
}
export function steamProposal(
  steam: SteamOwned,
  igdb?: IgdbGame,
  current?: Game,
) {
  const proposal: Record<string, unknown> = {
    title: igdb?.title ?? steam.title,
    platforms: mergeIgdbTags(current?.platforms ?? [], ["Steam"]),
    playtimeMinutes: steam.playtimeMinutes,
  };
  for (const field of metadataFields) {
    if (!isEmpty(igdb?.[field]))
      proposal[field] =
        field === "tags"
          ? mergeIgdbTags(current?.tags ?? [], igdb?.tags)
          : igdb![field];
  }
  return proposal;
}
export function steamChoices(
  steam: SteamOwned,
  igdb: IgdbGame | undefined,
  current: Game | undefined,
  prefs: SteamPreferences,
): SteamChoices {
  const proposal = steamProposal(steam, igdb, current);
  return Object.fromEntries(
    steamFields.map((field) => [
      field,
      !isEmpty(proposal[field]) &&
        JSON.stringify(proposal[field]) !== JSON.stringify(current?.[field]) &&
        // Remembered preferences never authorize replacing an existing playtime.
        !(
          field === "playtimeMinutes" && current?.playtimeMinutes !== undefined
        ) &&
        (prefs.mode === "manual"
          ? (prefs.fields[field] ?? isEmpty(current?.[field]))
          : prefs.mode === "replace" || isEmpty(current?.[field])),
    ]),
  );
}
export function matchSteam(
  steam: SteamOwned,
  igdb: IgdbGame | undefined,
  games: Game[],
) {
  const key = (value: string) =>
    value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
  const ids = games.filter(
    (game) =>
      game.steamAppId === steam.appId || (igdb && game.igdbId === igdb.id),
  );
  const titles = games.filter((game) =>
    [key(steam.title), key(igdb?.title ?? steam.title)].includes(
      key(game.title),
    ),
  );
  const candidates = [
    ...new Map([...ids, ...titles].map((game) => [game.id, game])).values(),
  ];
  const current = candidates[0];
  const conflict =
    candidates.length > 1 ||
    !!(
      current &&
      ((current.steamAppId && current.steamAppId !== steam.appId) ||
        (igdb && current.igdbId && current.igdbId !== igdb.id))
    );
  return {
    current: conflict ? undefined : current,
    conflict,
    titleOnly: !!current && !ids.length,
  };
}
export function steamInput(entry: SteamEntry, current?: Game): UpdateGameInput {
  if (current?.steamAppId && current.steamAppId !== entry.steam.appId)
    throw new Error("This game is linked to another Steam App ID.");
  if (entry.igdb && current?.igdbId && current.igdbId !== entry.igdb.id)
    throw new Error("This game is linked to another IGDB game.");
  const proposal = steamProposal(entry.steam, entry.igdb, current);
  const input: Record<string, unknown> = { steamAppId: entry.steam.appId };
  if (entry.status !== undefined) input.status = entry.status;
  for (const field of steamFields)
    if (entry.choices[field] && !isEmpty(proposal[field]))
      input[field] = proposal[field];
  if (entry.igdb) {
    input.igdbId = entry.igdb.id;
    input.availablePlatforms =
      entry.igdb.availablePlatforms ?? current?.availablePlatforms ?? [];
  }
  if (!current) {
    // Required identity and a store label are always present on a newly imported game.
    input.title ??= entry.steam.title;
    input.platforms = ["Steam"];
    return createGameSchema.parse(input);
  }
  return updateGameSchema.parse(input);
}
