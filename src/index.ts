import Fastify from "fastify";

const fastify = Fastify({ logger: true });

fastify.get("/health", async () => ({ status: "ok", stage: "minimal" }));

fastify.listen({ port: Number(process.env.PORT ?? 3000) });
