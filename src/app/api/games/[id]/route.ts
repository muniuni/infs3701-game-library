import { readMutation } from "@/lib/mutation-body";
import { getRepository } from "@/lib/server-repository";
import { updateGameSchema } from "@/lib/game";
import { apiError, notFound } from "@/lib/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  try {
    const game = await getRepository().getGame((await context.params).id);
    return game
      ? Response.json(game, { headers: { "Cache-Control": "no-store" } })
      : notFound();
  } catch (error) {
    return apiError(error);
  }
}
export async function PATCH(request: Request, context: Context) {
  try {
    const { input, image } = await readMutation(request);
    const game = await getRepository().updateGame(
      (await context.params).id,
      updateGameSchema.parse(input),
      image,
    );
    return game ? Response.json(game) : notFound();
  } catch (error) {
    return apiError(error);
  }
}
export async function DELETE(_request: Request, context: Context) {
  try {
    return (await getRepository().deleteGame((await context.params).id))
      ? new Response(null, { status: 204 })
      : notFound();
  } catch (error) {
    return apiError(error);
  }
}
