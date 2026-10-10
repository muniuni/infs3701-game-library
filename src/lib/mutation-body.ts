import { MAX_COVER_BYTES, UploadError, validateImage } from "./cover-storage";

// Bound the stream before multipart parsing, including chunked requests.
export async function readMutation(request: Request) {
  const multipart = request.headers
    .get("content-type")
    ?.startsWith("multipart/form-data");
  const limit = multipart ? MAX_COVER_BYTES + 512 * 1024 : 512 * 1024;
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader) {
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > limit) {
          await reader.cancel();
          throw new UploadError(
            "Request is too large. Game data must fit within 512 KB and covers within 5 MB.",
            413,
          );
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
  }
  const bytes = Buffer.concat(chunks);
  if (!multipart)
    return { input: JSON.parse(bytes.toString("utf8")), image: undefined };
  let form: FormData;
  try {
    form = await new Response(bytes, {
      headers: { "content-type": request.headers.get("content-type")! },
    }).formData();
  } catch {
    throw new UploadError("Invalid upload form.");
  }
  if (
    [...form.keys()].some((key) => !["input", "cover"].includes(key)) ||
    form.getAll("input").length !== 1 ||
    form.getAll("cover").length !== 1
  )
    throw new UploadError("Provide game input and one cover image.");
  const input = form.get("input"),
    file = form.get("cover");
  if (typeof input !== "string" || !(file instanceof File))
    throw new UploadError("Invalid upload form.");
  return { input: JSON.parse(input), image: await validateImage(file) };
}
