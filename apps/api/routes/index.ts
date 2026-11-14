import type { FastifyInstance } from "fastify";
import { generate } from "../controllers/generate.js";
import { health, ready } from "../controllers/health.js";
import { processQueue } from "../controllers/process-queue.js";
import { hmacAuth } from "../middleware/hmac-auth.js";
import type { AppDeps } from "../types.js";

export function registerRoutes(app: FastifyInstance, deps: AppDeps): void {
  app.get("/health", health());
  app.get("/ready", ready(deps));

  app.post("/v1/generate", { preHandler: hmacAuth(deps) }, generate(deps));

  const queueHandler = processQueue(deps);
  app.get("/api/internal/process-queue", queueHandler);
  app.post("/api/internal/process-queue", queueHandler);
}
