import { z } from "zod";
import { steamClient } from "@/lib/server-steam";
import { steamApiError } from "@/lib/steam-api";
import { readMutation } from "@/lib/mutation-body";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const { account } = z
      .object({ account: z.string().trim().min(1).max(256) })
      .strict()
      .parse((await readMutation(request)).input);
    return Response.json(await steamClient.library(account, request.signal), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return steamApiError(error);
  }
}
