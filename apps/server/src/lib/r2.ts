import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

export const BUCKET = process.env.R2_BUCKET_NAME ?? "chat-media";
export const PUBLIC_URL = process.env.R2_PUBLIC_URL ?? "";

const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "image",
  "image/png": "image",
  "image/gif": "image",
  "image/webp": "image",
  "application/pdf": "pdf",
  "video/mp4": "video",
  "video/webm": "video",
  "audio/mpeg": "audio",
  "audio/ogg": "audio",
  "audio/wav": "audio",
  "audio/webm": "audio",
  "application/zip": "file",
  "application/x-zip-compressed": "file",
  "application/octet-stream": "file",
};

export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export function getMimeCategory(mimeType: string): string | null {
  return ALLOWED_TYPES[mimeType] ?? null;
}

export async function uploadToR2(
  buffer: Buffer,
  key: string,
  contentType: string
): Promise<string> {
  await r2.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );
  return `${PUBLIC_URL}/${key}`;
}
