import { z } from "zod";
import {
  updateGameSchema,
  platformSchema,
  screenshotSchema,
  type Cover,
} from "./game";

export const metadataFields = [
  "title",
  "releaseDate",
  "cover",
  "tags",
  "developers",
  "publishers",
  "summary",
  "storyline",
  "screenshots",
] as const;
export type MetadataField = (typeof metadataFields)[number];
export type MetadataMode = "empty" | "replace" | "manual";
export type MetadataChoices = Record<MetadataField, boolean>;
export const metadataLabels: Record<MetadataField, string> = {
  title: "Title",
  releaseDate: "Release date",
  cover: "Cover",
  tags: "Tags",
  developers: "Developers",
  publishers: "Publishers",
  summary: "Summary",
  storyline: "Storyline",
  screenshots: "Screenshots",
};
export const igdbGameSchema = z
  .object({
    id: z.number().int().positive().safe(),
    title: z.string().trim().min(1).max(160),
    releaseYear: z.number().int().optional(),
    releaseDate: z.string().optional(),
    cover: z
      .object({
        type: z.literal("url"),
        url: z
          .string()
          .url()
          .refine((url) => /^https:\/\/images\.igdb\.com\//.test(url)),
      })
      .optional(),
    tags: z.array(z.string()).optional(),
    availablePlatforms: z.array(platformSchema).max(100).optional(),
    developers: z.array(z.string()).optional(),
    publishers: z.array(z.string()).optional(),
    summary: z.string().max(20000).optional(),
    storyline: z.string().max(20000).optional(),
    screenshots: z.array(screenshotSchema).max(30).optional(),
  })
  .strict()
  .superRefine(({ id, releaseYear, ...input }, context) => {
    void id;
    void releaseYear;
    if (!updateGameSchema.safeParse(input).success)
      context.addIssue({ code: "custom", message: "Invalid game metadata." });
  });
export type IgdbGame = z.infer<typeof igdbGameSchema>;
export type MetadataDraft = {
  availablePlatforms?: { id: number; name: string }[];
  title: string;
  releaseDate: string;
  cover: Cover;
  tags: string[];
  developers: string[];
  publishers: string[];
  summary: string;
  storyline: string;
  screenshots: { imageId: string }[];
};
export function mergeIgdbTags(tags: string[], genres: string[] = []) {
  return [...tags, ...genres].filter(
    (value, index, all) =>
      all.findIndex((other) => other.toLowerCase() === value.toLowerCase()) ===
      index,
  );
}
export function isEmpty(value: unknown) {
  return (
    value == null ||
    (typeof value === "string" && !value.trim()) ||
    (Array.isArray(value) && !value.length) ||
    (typeof value === "object" &&
      "type" in value &&
      value.type === "placeholder")
  );
}
export function metadataProposal(
  draft: MetadataDraft,
  game: IgdbGame,
): MetadataDraft {
  const next = { ...draft };
  for (const field of metadataFields) {
    const value = game[field];
    if (!isEmpty(value))
      Object.assign(next, {
        [field]:
          field === "tags" ? mergeIgdbTags(draft.tags, game.tags) : value,
      });
  }
  return next;
}
export function metadataChoices(
  draft: MetadataDraft,
  game: IgdbGame,
  mode: Exclude<MetadataMode, "manual">,
): MetadataChoices {
  const proposal = metadataProposal(draft, game);
  return Object.fromEntries(
    metadataFields.map((field) => [
      field,
      JSON.stringify(draft[field]) !== JSON.stringify(proposal[field]) &&
        (mode === "replace" || isEmpty(draft[field])),
    ]),
  ) as MetadataChoices;
}
export function applyMetadata(
  draft: MetadataDraft,
  game: IgdbGame,
  choices: MetadataChoices,
): MetadataDraft {
  const proposal = metadataProposal(draft, game);
  const next = { ...draft };
  for (const field of metadataFields)
    if (choices[field]) Object.assign(next, { [field]: proposal[field] });
  return next;
}
export function screenshotUrl(imageId: string, large = false) {
  return `https://images.igdb.com/igdb/image/upload/${large ? "t_1080p" : "t_screenshot_med"}/${imageId}.jpg`;
}
