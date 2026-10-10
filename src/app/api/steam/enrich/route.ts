import { z } from "zod";
import { igdbClient } from "@/lib/server-igdb";
import { steamApiError } from "@/lib/steam-api";
import { readMutation } from "@/lib/mutation-body";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const { appIds } = z
      .object({
        appIds: z
          .array(z.number().int().positive().max(4294967295))
          .min(1)
          .max(20),
      })
      .strict()
      .parse((await readMutation(request)).input);
    return Response.json(await igdbClient.matchSteam(appIds, request.signal), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return steamApiError(error);
  }
}
