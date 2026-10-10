import { z } from "zod";
import { steamEntrySchema } from "@/lib/steam";
import { getRepository } from "@/lib/server-repository";
import { readMutation } from "@/lib/mutation-body";
import { steamApiError } from "@/lib/steam-api";
import { DuplicateGameError } from "@/lib/repository";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const { entries } = z
      .object({ entries: z.array(steamEntrySchema).min(1).max(10) })
      .strict()
      .parse((await readMutation(request)).input);
    const results = [];
    for (const entry of entries) {
      try {
        results.push({
          appId: entry.steam.appId,
          game: await getRepository().importSteam(entry),
        });
      } catch (error) {
        // Only our domain errors are returned; never send DB/provider internals.
        const safe =
          error instanceof DuplicateGameError ||
          (error instanceof Error &&
            /^(This |A matching |The imported )/.test(error.message));
        results.push({
          appId: entry.steam.appId,
          error: safe
            ? (error as Error).message
            : error instanceof z.ZodError
              ? "Selected fields exceed the game limits. Review the selection."
              : "Could not save this game. Retry the import.",
        });
      }
    }
    return Response.json(
      { results },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return steamApiError(error);
  }
}
