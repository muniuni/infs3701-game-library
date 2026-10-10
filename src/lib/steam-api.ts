import { z } from "zod";
import { SteamError } from "./server-steam";
import { IgdbError } from "./server-igdb";
import { UploadError } from "./cover-storage";
export function steamApiError(error: unknown) {
  const known =
    error instanceof SteamError ||
    error instanceof IgdbError ||
    error instanceof UploadError;
  return Response.json(
    {
      error: known
        ? error.message
        : error instanceof z.ZodError || error instanceof SyntaxError
          ? "Invalid import request. Review your selection."
          : "Import failed. Please try again.",
    },
    {
      status: known
        ? error.status
        : error instanceof z.ZodError || error instanceof SyntaxError
          ? 400
          : 500,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
