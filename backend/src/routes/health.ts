import type { FastifyInstance } from "fastify";
import { prisma } from "../db/client.js";
import { redis } from "../lib/redis.js";

/**
 * Used by Fly.io's health checker to decide whether to restart the machine.
 * Reports DOWN only for things that actually mean the service can't serve
 * traffic (DB/Redis unreachable) — a slow/rate-limited StudioNet is not a
 * reason to restart the machine, so it's deliberately not checked here.
 */
export async function healthRoutes(app: FastifyInstance) {
  app.get("/healthz", async (_request, reply) => {
    const checks: Record<string, boolean> = {};

    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.database = true;
    } catch {
      checks.database = false;
    }

    try {
      await redis.ping();
      checks.redis = true;
    } catch {
      checks.redis = false;
    }

    const healthy = Object.values(checks).every(Boolean);
    return reply.code(healthy ? 200 : 503).send({ status: healthy ? "ok" : "degraded", checks });
  });
}
