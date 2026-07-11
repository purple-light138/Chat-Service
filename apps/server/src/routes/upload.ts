import type { FastifyInstance } from "fastify";
import { requireAuth } from "../middleware/auth.js";
import { uploadToR2, getMimeCategory, MAX_FILE_SIZE } from "../lib/r2.js";
import type { MessageType } from "@chat/shared";

export async function uploadRoutes(app: FastifyInstance) {
  app.post("/upload", { preHandler: [requireAuth] }, async (req, reply) => {
    const data = await req.file();

    if (!data) {
      return reply.status(400).send({ error: "No file provided" });
    }

    const category = getMimeCategory(data.mimetype);
    if (!category) {
      return reply.status(400).send({ error: `Unsupported file type: ${data.mimetype}` });
    }

    const chunks: Buffer[] = [];
    let totalSize = 0;

    for await (const chunk of data.file) {
      totalSize += chunk.length;
      if (totalSize > MAX_FILE_SIZE) {
        return reply.status(413).send({ error: "File too large (max 50MB)" });
      }
      chunks.push(chunk as Buffer);
    }

    const buffer = Buffer.concat(chunks);
    const ext = data.filename.split(".").pop() ?? "bin";
    const key = `${req.userId}/${crypto.randomUUID()}.${ext}`;

    const url = await uploadToR2(buffer, key, data.mimetype);

    return reply.send({
      url,
      fileName: data.filename,
      fileSize: totalSize,
      type: category as MessageType,
    });
  });
}
