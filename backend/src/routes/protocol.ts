import type { FastifyInstance } from "fastify";
import { prisma } from "../db/client.js";
import { contract, CONTRACT_ADDRESS } from "../genlayer/client.js";
import { config } from "../config.js";

/**
 * Every route here is a READ against the Postgres index cache (fast,
 * paginated, no StudioNet round-trip) with one exception
 * (`/protocol/withdrawable/:address`, which is cheap and per-user so it is
 * relayed live through the rate limiter instead of cached). No route in
 * this file ever writes SLA/Claim/Challenge state — see prisma/schema.prisma
 * for why that boundary matters.
 */
export async function protocolRoutes(app: FastifyInstance) {
  app.get("/protocol/config", async () => {
    return {
      contractAddress: CONTRACT_ADDRESS,
      networkAlias: config.genlayer.networkAlias,
      chainId: config.genlayer.chainId,
      rpcUrl: config.genlayer.rpcUrl,
    };
  });

  app.get("/protocol/stats", async (_request, reply) => {
    try {
      const stats = await contract.getProtocolStats();
      return stats;
    } catch (err) {
      app.log.error({ err }, "live protocol stats read failed, falling back to cache");
      return reply.send({ note: "live read unavailable, see /protocol/stats/cached" });
    }
  });

  app.get("/slas", async (request) => {
    const query = request.query as { status?: string; provider?: string; customer?: string; page?: string };
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = 25;
    const where: Record<string, unknown> = {};
    if (query.status) where.status = query.status;
    if (query.provider) where.provider = query.provider.toLowerCase();
    if (query.customer) where.customer = query.customer.toLowerCase();

    const [rows, total] = await Promise.all([
      prisma.slaAgreement.findMany({
        where,
        orderBy: { slaId: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.slaAgreement.count({ where }),
    ]);

    return { rows, total, page, pageSize };
  });

  app.get("/slas/:slaId", async (request, reply) => {
    const { slaId } = request.params as { slaId: string };
    const row = await prisma.slaAgreement.findUnique({ where: { slaId } });
    if (!row) return reply.code(404).send({ error: "SLA not found" });

    const claims = await prisma.claim.findMany({
      where: { slaId },
      orderBy: { claimId: "desc" },
    });
    return { sla: row, claims };
  });

  app.get("/claims", async (request) => {
    const query = request.query as { status?: string; slaId?: string; claimant?: string; page?: string };
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = 25;
    const where: Record<string, unknown> = {};
    if (query.status) where.status = query.status;
    if (query.slaId) where.slaId = query.slaId;
    if (query.claimant) where.claimant = query.claimant.toLowerCase();

    const [rows, total] = await Promise.all([
      prisma.claim.findMany({
        where,
        orderBy: { claimId: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.claim.count({ where }),
    ]);

    return { rows, total, page, pageSize };
  });

  app.get("/claims/:claimId", async (request, reply) => {
    const { claimId } = request.params as { claimId: string };
    const row = await prisma.claim.findUnique({ where: { claimId } });
    if (!row) return reply.code(404).send({ error: "Claim not found" });

    const challenge = row.activeChallengeId
      ? await prisma.challenge.findUnique({ where: { challengeId: row.activeChallengeId } })
      : null;

    return { claim: row, challenge };
  });

  app.get("/challenges/:challengeId", async (request, reply) => {
    const { challengeId } = request.params as { challengeId: string };
    const row = await prisma.challenge.findUnique({ where: { challengeId } });
    if (!row) return reply.code(404).send({ error: "Challenge not found" });
    return { challenge: row };
  });

  app.get("/protocol/withdrawable/:address", async (request, reply) => {
    const { address } = request.params as { address: string };
    try {
      const balance = await contract.getWithdrawableBalance(address);
      return { address, withdrawableWei: balance };
    } catch (err) {
      app.log.error({ err }, "withdrawable balance read failed");
      return reply.code(502).send({ error: "Unable to read balance from StudioNet right now" });
    }
  });
}
