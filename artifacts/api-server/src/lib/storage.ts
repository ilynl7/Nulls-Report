import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { httpError } from "./http";

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export type StorageMode = "s3" | "local";

/**
 * Storage is S3-compatible (AWS S3, Cloudflare R2, Backblaze B2, MinIO, …)
 * when a bucket env var is configured. Without one, uploads are stored on the
 * local disk of the API process — fine for development/preview, but set a
 * bucket for durable production attachment storage.
 */
export function storageMode(): StorageMode {
  return process.env.S3_BUCKET ?? process.env.R2_BUCKET ? "s3" : "local";
}

function s3Config() {
  return {
    bucket: process.env.S3_BUCKET ?? process.env.R2_BUCKET ?? "",
    endpoint: process.env.S3_ENDPOINT ?? process.env.R2_ENDPOINT,
    region: process.env.S3_REGION ?? (process.env.R2_BUCKET ? "auto" : "us-east-1"),
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey:
      process.env.S3_SECRET_ACCESS_KEY ?? process.env.AWS_SECRET_ACCESS_KEY,
  };
}

let cachedClient: S3Client | null = null;

function s3Client(): S3Client {
  if (cachedClient) {
    return cachedClient;
  }
  const config = s3Config();
  cachedClient = new S3Client({
    region: config.region,
    ...(config.endpoint ? { endpoint: config.endpoint } : {}),
    ...(config.accessKeyId && config.secretAccessKey
      ? {
          credentials: {
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.secretAccessKey,
          },
        }
      : {}),
  });
  return cachedClient;
}

export async function createUploadUrl(input: {
  objectPath: string;
  contentType: string;
  size: number;
}): Promise<string> {
  const config = s3Config();
  const command = new PutObjectCommand({
    Bucket: config.bucket,
    Key: input.objectPath,
    ContentType: input.contentType,
    ContentLength: input.size,
  });
  return getSignedUrl(s3Client(), command, { expiresIn: 60 * 60 });
}

// ---------------------------------------------------------------------------
// Local (dev) storage
// ---------------------------------------------------------------------------

function localRoot(): string {
  return path.resolve(process.env.ATTACHMENT_DIR ?? path.resolve(process.cwd(), ".local-uploads"));
}

function safeLocalPath(objectPath: string): string {
  const root = path.resolve(localRoot());
  const full = path.resolve(root, objectPath);
  if (full !== root && !full.startsWith(root + path.sep)) {
    throw httpError(400, "Invalid object path");
  }
  return full;
}

export async function saveLocalUpload(objectPath: string, data: Buffer): Promise<void> {
  const target = safeLocalPath(objectPath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, data);
}

/**
 * Persists raw bytes in whichever storage mode is configured (S3-compatible
 * bucket or the local disk fallback). Used for avatar uploads and any other
 * server-side ingest.
 */
export async function saveObject(
  objectPath: string,
  data: Buffer,
  contentType: string,
): Promise<void> {
  if (storageMode() === "s3") {
    const config = s3Config();
    await s3Client().send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: objectPath,
        Body: data,
        ContentType: contentType,
      }),
    );
    return;
  }
  await saveLocalUpload(objectPath, data);
}

export async function localUploadExists(objectPath: string): Promise<boolean> {
  try {
    const target = safeLocalPath(objectPath);
    const info = await stat(target);
    return info.isFile();
  } catch {
    return false;
  }
}

export async function readLocalUpload(objectPath: string): Promise<Buffer> {
  try {
    return await readFile(safeLocalPath(objectPath));
  } catch {
    throw httpError(404, "Attachment file not found");
  }
}

export async function objectStream(objectPath: string) {
  if (storageMode() === "s3") {
    const config = s3Config();
    const command = new GetObjectCommand({ Bucket: config.bucket, Key: objectPath });
    const url = await getSignedUrl(s3Client(), command, { expiresIn: 60 * 60 });
    return { kind: "redirect" as const, url };
  }
  return { kind: "buffer" as const, data: await readLocalUpload(objectPath) };
}
