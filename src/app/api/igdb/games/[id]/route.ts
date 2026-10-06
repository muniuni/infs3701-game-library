import { igdbClient, igdbApiError } from "@/lib/server-igdb";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const game = await igdbClient.get((await context.params).id);
    return Response.json(game ?? { error: "IGDB game not found." }, {
      status: game ? 200 : 404,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return igdbApiError(error);
  }
}
