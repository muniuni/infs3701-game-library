import { z } from "zod";
import { updateGameSchema, type Cover } from "./game";

export const metadataFields = [
  "title",
  "releaseDate",
  "cover",
  "tags",
] as const;
export type MetadataField = (typeof metadataFields)[number];
export type MetadataPreferences = Record<MetadataField, boolean>;
export const igdbPreferenceKey = "game-library.igdb-fields.v1";
export const defaultMetadataPreferences: MetadataPreferences = {
  title: true,
  releaseDate: true,
  cover: true,
  tags: true,
};
export const igdbGameSchema = z
  .object({
    id: z.number().int().positive().safe(),
    title: z.string().trim().min(1).max(160),
    releaseYear: z.number().int().optional(),
    releaseDate: z.string().optional(),
    cover: z
      .object({ type: z.literal("url"), url: z.string().url() })
      .optional(),
    tags: z.array(z.string()).optional(),
  })
  .strict()
  .superRefine((game, context) => {
    const { id, releaseYear, ...input } = game;
    void id;
    void releaseYear;
    if (!updateGameSchema.safeParse(input).success)
      context.addIssue({ code: "custom", message: "Invalid game metadata." });
  });
export type IgdbGame = z.infer<typeof igdbGameSchema>;
export type MetadataDraft = {
  title: string;
  releaseDate: string;
  tags: string[];
  cover: Cover;
};
export function readMetadataPreferences(
  value: string | null,
): MetadataPreferences {
  try {
    const parsed = z
      .object({
        title: z.boolean(),
        releaseDate: z.boolean(),
        cover: z.boolean(),
        tags: z.boolean(),
      })
      .strict()
      .parse(JSON.parse(value ?? "null"));
    return parsed;
  } catch {
    return { ...defaultMetadataPreferences };
  }
}
export function metadataChoices(draft: MetadataDraft, proposal: IgdbGame) {
  return Object.fromEntries(
    metadataFields.map((field) => [
      field,
      metadataChanged(draft, proposal, field),
    ]),
  ) as MetadataPreferences;
}
export function mergeIgdbTags(tags: string[], genres: string[] = []) {
  const merged = [...tags];
  for (const genre of genres) {
    if (merged.length >= 30) break;
    if (!merged.some((tag) => tag.toLowerCase() === genre.toLowerCase()))
      merged.push(genre);
  }
  return merged;
}
export function editAutofillProposal(
  draft: MetadataDraft,
  proposal: IgdbGame,
): IgdbGame {
  return {
    ...proposal,
    tags: proposal.tags ? mergeIgdbTags(draft.tags, proposal.tags) : undefined,
  };
}
export function metadataChanged(
  draft: MetadataDraft,
  proposal: IgdbGame,
  field: MetadataField,
) {
  const value = proposal[field];
  if (value === undefined || (Array.isArray(value) && !value.length))
    return false;
  return JSON.stringify(draft[field]) !== JSON.stringify(value);
}

// Create selection is assistance: merge personal tags and retain manual uploads.
export function createAutofillDraft(
  draft: MetadataDraft,
  proposal: IgdbGame,
  preferences: MetadataPreferences,
): { draft: MetadataDraft; changed: MetadataField[] } {
  const next: MetadataDraft = { ...draft, tags: [...draft.tags] };
  if (preferences.title) next.title = proposal.title;
  if (preferences.releaseDate && proposal.releaseDate)
    next.releaseDate = proposal.releaseDate;
  if (preferences.cover && proposal.cover && draft.cover.type !== "upload")
    next.cover = proposal.cover;
  if (preferences.tags && proposal.tags?.length) {
    next.tags = mergeIgdbTags(draft.tags, proposal.tags);
  }
  return {
    draft: next,
    changed: metadataFields.filter(
      (field) => JSON.stringify(next[field]) !== JSON.stringify(draft[field]),
    ),
  };
}
