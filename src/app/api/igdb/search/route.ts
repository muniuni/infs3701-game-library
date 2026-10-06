import { igdbClient, igdbApiError } from "@/lib/server-igdb";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    return Response.json(
      await igdbClient.search(new URL(request.url).searchParams.get("q") ?? ""),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return igdbApiError(error);
  }
}
