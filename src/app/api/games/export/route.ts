import { getRepository } from "@/lib/server-repository";
import { createLibraryExport } from "@/lib/library-export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = createLibraryExport(await getRepository().listGames());
    return new Response(JSON.stringify(data, null, 2) + "\n", {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="game-library-${data.exportedAt.slice(0, 10)}.json"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return Response.json(
      { error: "Could not export the library. Please try again." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
