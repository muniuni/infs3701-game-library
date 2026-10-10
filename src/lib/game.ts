import { z } from "zod";
export const statuses = [
  "Unplayed",
  "Playing",
  "Completed",
  "Backlog",
  "Dropped",
] as const;
export type GameStatus = (typeof statuses)[number];
export type Cover =
  { type: "upload" | "url" | "api"; url: string } | { type: "placeholder" };
export type Game = {
  id: string;
  igdbId?: number;
  steamAppId?: number;
  availablePlatforms?: { id: number; name: string }[];
  developers?: string[];
  publishers?: string[];
  summary?: string;
  storyline?: string;
  screenshots?: { imageId: string }[];
  title: string;
  platforms: string[];
  tags: string[];
  releaseDate?: string;
  status: GameStatus;
  playtimeMinutes?: number;
  rating?: number;
  review?: string;
  cover: Cover;
  createdAt: string;
  updatedAt: string;
};
const labels = z
  .array(z.string().trim().min(1).max(60))
  .max(30)
  .transform((values) =>
    values.filter(
      (value, index) =>
        values.findIndex(
          (other) => other.toLowerCase() === value.toLowerCase(),
        ) === index,
    ),
  );
const remoteUrl = z
  .string()
  .url()
  .max(2048)
  .refine(
    (value) => ["http:", "https:"].includes(new URL(value).protocol),
    "Use an HTTP or HTTPS URL.",
  );
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return (
      !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
    );
  }, "Enter a valid calendar date.");
// Upload references are server-owned and can only be created through multipart saves.
export const platformSchema = z
  .object({
    id: z.number().int().positive().safe(),
    name: z.string().trim().min(1).max(120),
  })
  .strict();
export const screenshotSchema = z
  .object({
    imageId: z
      .string()
      .regex(/^[A-Za-z0-9_]+$/)
      .max(120),
  })
  .strict();
const companies = z
  .array(z.string().trim().min(1).max(160))
  .max(50)
  .transform((values) =>
    values.filter(
      (value, index) =>
        values.findIndex(
          (other) => other.toLowerCase() === value.toLowerCase(),
        ) === index,
    ),
  );
const fields = {
  steamAppId: z.number().int().positive().max(4294967295).nullable().optional(),
  igdbId: z.number().int().positive().safe().nullable().optional(),
  availablePlatforms: z.array(platformSchema).max(100).optional(),
  developers: companies.optional(),
  publishers: companies.optional(),
  summary: z.string().trim().max(20000).nullable().optional(),
  storyline: z.string().trim().max(20000).nullable().optional(),
  screenshots: z.array(screenshotSchema).max(30).optional(),
  title: z.string().trim().min(1, "Title is required.").max(160),
  platforms: labels,
  tags: labels,
  status: z.enum(statuses),
  releaseDate: isoDate.nullable().optional(),
  playtimeMinutes: z
    .number()
    .int()
    .nonnegative()
    .max(Number.MAX_SAFE_INTEGER)
    .nullable()
    .optional(),
  rating: z.number().int().min(1).max(10).nullable().optional(),
  review: z.string().trim().max(10000).nullable().optional(),
  cover: z.discriminatedUnion("type", [
    z.object({ type: z.literal("placeholder") }).strict(),
    z.object({ type: z.literal("url"), url: remoteUrl }).strict(),
  ]),
};
export const createGameSchema = z
  .object({
    ...fields,
    platforms: labels.default([]),
    tags: labels.default([]),
    status: fields.status.default("Unplayed"),
    cover: fields.cover.default({ type: "placeholder" }),
  })
  .strict();
export const updateGameSchema = z
  .object(fields)
  .partial()
  .strict()
  .refine(
    (value) => Object.keys(value).length > 0,
    "Provide at least one field.",
  );
export type CreateGameInput = z.output<typeof createGameSchema>;
export type UpdateGameInput = z.output<typeof updateGameSchema>;
export function formatPlaytime(minutes?: number) {
  if (minutes === undefined) return "Not set";
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
