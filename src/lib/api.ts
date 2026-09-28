import { ZodError } from "zod";
import { DuplicateGameError } from "./repository";
export function apiError(error: unknown) {
  if (error instanceof ZodError)
    return Response.json(
      {
        error: error.issues
          .map(
            (issue) => `${issue.path.join(".") || "Input"}: ${issue.message}`,
          )
          .join(" "),
      },
      { status: 400 },
    );
  if (error instanceof SyntaxError)
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  if (error instanceof DuplicateGameError)
    return Response.json({ error: error.message }, { status: 409 });
  console.error("Game request failed", error);
  return Response.json(
    { error: "Unable to complete this request. Please try again." },
    { status: 500 },
  );
}
export function notFound() {
  return Response.json({ error: "Game not found." }, { status: 404 });
}
