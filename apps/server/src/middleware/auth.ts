import type { FastifyRequest, FastifyReply } from "fastify";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { sessions } from "../db/schema.js";

declare module "fastify" {
  interface FastifyRequest {
    userId: string;
  }
}

function extractSessionToken(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/better-auth\.session_token=([^;]+)/);
  if (!match) return null;
  // Cookie stores "token.hmacHash" — DB stores just the token part
  const decoded = decodeURIComponent(match[1]);
  return decoded.split(".")[0];
}

export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  const token = extractSessionToken(req.headers.cookie);
  if (!token) return reply.status(401).send({ error: "Unauthorized" });

  const [row] = await db
    .select({ userId: sessions.userId })
    .from(sessions)
    .where(eq(sessions.token, token))
    .limit(1);

  if (!row) return reply.status(401).send({ error: "Unauthorized" });

  req.userId = row.userId;
}
