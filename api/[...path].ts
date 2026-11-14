import type { IncomingMessage, ServerResponse } from "node:http";
import app from "../src/index.js";

/**
 * Vercel catch-all entrypoint.
 * Vercel rewrites public paths to /api/:path; strip that internal prefix
 * before handing the request to Fastify so the same routes work locally.
 */
export default async function handler(
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  await app.ready();

  const originalUrl = request.url ?? "/";
  request.url = originalUrl.replace(/^\/api(?=\/|\?|$)/, "") || "/";
  app.server.emit("request", request, response);
}
