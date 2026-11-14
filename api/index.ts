import type { IncomingMessage, ServerResponse } from "node:http";
import app from "../src/index.js";

const ROUTED_PATH_PARAM = "__forge_original_path";

/**
 * Single Vercel Function entrypoint for every public route.
 *
 * vercel.json rewrites requests to /api/index and stores the original
 * pathname in ROUTED_PATH_PARAM. Restore the original URL before handing
 * the request to Fastify so route matching and query parameters are kept.
 */
export default async function handler(
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  await app.ready();

  const incomingUrl = new URL(request.url ?? "/", "http://vercel.internal");
  const originalPath = incomingUrl.searchParams.get(ROUTED_PATH_PARAM) ?? "/";
  incomingUrl.searchParams.delete(ROUTED_PATH_PARAM);

  const pathname = originalPath.startsWith("/")
    ? originalPath
    : `/${originalPath}`;
  const query = incomingUrl.searchParams.toString();

  request.url = query ? `${pathname}?${query}` : pathname;
  app.server.emit("request", request, response);
}
