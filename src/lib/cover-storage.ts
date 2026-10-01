import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import sharp from "sharp";

export const MAX_COVER_BYTES = 5 * 1024 * 1024;
export class UploadError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export type ImageUpload = { bytes: Buffer; contentType: string };
export interface CoverStorage {
  put(key: string, image: ImageUpload): Promise<void>;
  get(key: string): Promise<ImageUpload>;
  delete(key: string): Promise<void>;
}

export async function validateImage(file: File): Promise<ImageUpload> {
  if (!file.size || file.size > MAX_COVER_BYTES)
    throw new UploadError("Choose an image up to 5 MB.", file.size ? 413 : 400);
  const formats: Record<string, string> = {
    "image/jpeg": "jpeg",
    "image/png": "png",
    "image/webp": "webp",
  };
  if (!formats[file.type])
    throw new UploadError("Use a JPEG, PNG or WebP image.");
  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const image = sharp(bytes, {
      limitInputPixels: 40_000_000,
      failOn: "warning",
    });
    const metadata = await image.metadata();
    if (metadata.format !== formats[file.type] || (metadata.pages ?? 1) > 1)
      throw new Error("Unsupported image");
    // Decode and re-encode to reject corrupt data and discard embedded metadata.
    const clean = await image.toBuffer();
    if (clean.length > MAX_COVER_BYTES)
      throw new Error("Decoded image too large");
    return { bytes: clean, contentType: file.type };
  } catch {
    throw new UploadError(
      "This image could not be read. Choose a valid, non-animated JPEG, PNG or WebP up to 5 MB (40 megapixels maximum).",
    );
  }
}

export class S3CoverStorage implements CoverStorage {
  private client = new S3Client({
    region: process.env.AWS_REGION || "us-east-1",
    maxAttempts: 3,
    ...(process.env.STORAGE_MODE === "local" && process.env.S3_ENDPOINT
      ? { endpoint: process.env.S3_ENDPOINT, forcePathStyle: true }
      : {}),
  });
  private bucket = process.env.S3_BUCKET || "infs3701-game-library-images";
  async put(key: string, image: ImageUpload) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: image.bytes,
        ContentType: image.contentType,
      }),
      { abortSignal: AbortSignal.timeout(60_000) },
    );
  }
  async get(key: string) {
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { abortSignal: AbortSignal.timeout(60_000) },
    );
    if (!result.Body) throw new Error("Missing S3 body");
    return {
      bytes: Buffer.from(await result.Body.transformToByteArray()),
      contentType: result.ContentType || "application/octet-stream",
    };
  }
  async delete(key: string) {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      { abortSignal: AbortSignal.timeout(60_000) },
    );
  }
}
