import { readMutation } from "@/lib/mutation-body";
import { getRepository } from "@/lib/server-repository";
import { createGameSchema } from "@/lib/game";
import { apiError } from "@/lib/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return Response.json(await getRepository().listGames(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request) {
  try {
    const { input, image } = await readMutation(request);
    return Response.json(
      await getRepository().createGame(createGameSchema.parse(input), image),
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}
