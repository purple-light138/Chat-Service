import type { FastifyInstance } from "fastify";
import { requireAuth } from "../middleware/auth.js";

// Cache fresh TURN credentials for 10 minutes
let cachedServers: object[] | null = null;
let cacheExpiry = 0;

async function fetchMeteredServers(apiKey: string): Promise<object[]> {
  const now = Date.now();
  if (cachedServers && now < cacheExpiry) return cachedServers;
  try {
    const res = await fetch(`https://openrelay.metered.ca/api/v1/turn/credentials?apiKey=${apiKey}`);
    if (res.ok) {
      const data = await res.json() as object[];
      cachedServers = data;
      cacheExpiry = now + 10 * 60 * 1000;
      return data;
    }
  } catch {}
  return [];
}

export async function iceRoutes(app: FastifyInstance) {
  app.get("/ice-servers", { preHandler: [requireAuth] }, async (_req, reply) => {
    // Prefer env-var configured TURN (e.g. Cloudflare/Twilio/custom Coturn)
    const turnUrls = process.env.TURN_URLS?.split(",").map(u => u.trim()).filter(Boolean);
    const turnUser = process.env.TURN_USERNAME;
    const turnCred = process.env.TURN_CREDENTIAL;

    if (turnUrls?.length && turnUser && turnCred) {
      return reply.send([
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: turnUrls, username: turnUser, credential: turnCred },
      ]);
    }

    // Use Metered.ca API for fresh TURN credentials (avoids stale hardcoded creds)
    const apiKey = process.env.METERED_API_KEY ?? "openrelayproject";
    const metered = await fetchMeteredServers(apiKey);
    if (metered.length) {
      return reply.send(metered);
    }

    // Last-resort fallback (may be unreliable without a real account)
    return reply.send([
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:stun.cloudflare.com:3478" },
    ]);
  });
}
