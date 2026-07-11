import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { uploadToR2, getMimeCategory, MAX_FILE_SIZE } from "./r2.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Resolve uploads dir relative to project root (works in both dev and prod)
const UPLOADS_DIR = path.join(__dirname, "../../../../uploads");

function isR2Configured() {
  const id = process.env.R2_ACCOUNT_ID ?? "";
  return id.length > 0 && id !== "placeholder";
}

export { getMimeCategory, MAX_FILE_SIZE };

export async function uploadFile(buffer: Buffer, key: string, mimeType: string): Promise<string> {
  if (isR2Configured()) {
    return uploadToR2(buffer, key, mimeType);
  }

  // Local fallback: save to uploads/ and return a /uploads/:key URL
  const filePath = path.join(UPLOADS_DIR, key);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, buffer);

  const host = process.env.BETTER_AUTH_URL ?? "http://localhost:3001";
  return `${host}/uploads/${key}`;
}
