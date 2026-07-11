import "dotenv/config";
import { createServer } from "http";
import path from "path";
import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import { Server } from "socket.io";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./lib/auth.js";
import { userRoutes } from "./routes/users.js";
import { conversationRoutes } from "./routes/conversations.js";
import { groupRoutes } from "./routes/groups.js";
import { messageRoutes } from "./routes/messages.js";
import { uploadRoutes } from "./routes/upload.js";
import { setupSocket } from "./socket/index.js";
import { runMigrations } from "./db/migrate.js";

const isProduction = process.env.NODE_ENV === "production";
const CLIENT = process.env.CLIENT_URL ?? "http://localhost:5173";
const port = parseInt(process.env.PORT ?? "3001");

await runMigrations();

const app = Fastify({ logger: true });
const authHandler = toNodeHandler(auth);

function setCorsHeaders(res: import("http").ServerResponse, origin: string | undefined) {
  const allowed = isProduction ? origin : CLIENT;
  if (!origin || (!isProduction && origin !== CLIENT)) return;
  res.setHeader("Access-Control-Allow-Origin", allowed!);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization,Cookie");
}

// Create HTTP server and io early so we can pass io to routes
const httpServer = createServer((req, res) => {
  if (req.url?.startsWith("/api/auth")) {
    setCorsHeaders(res, req.headers.origin);
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    return authHandler(req, res);
  }
  app.server.emit("request", req, res);
});

const io = new Server(httpServer, {
  cors: { origin: CLIENT, credentials: true },
});

await app.register(cors, { origin: CLIENT, credentials: true });
await app.register(cookie);
await app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } });

await app.register(userRoutes, { prefix: "/api" });
await app.register(conversationRoutes, { prefix: "/api" });
await app.register(groupRoutes, { prefix: "/api", io });
await app.register(messageRoutes, { prefix: "/api", io });
await app.register(uploadRoutes, { prefix: "/api" });

if (isProduction) {
  const webDist = path.join(process.cwd(), "apps/web/dist");
  await app.register(fastifyStatic, { root: webDist, prefix: "/", wildcard: false });
  app.setNotFoundHandler((_req, reply) => {
    reply.sendFile("index.html");
  });
}

await app.ready();

setupSocket(io as any);

httpServer.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
