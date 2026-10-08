import type { FastifyInstance } from "fastify";
import { prisma } from "../db/client.js";
import { contract, CONTRACT_ADDRESS } from "../genlayer/client.js";
import { config } from "../config.js";
import { upsertSla } from "../indexer/poll.js";

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const text = (value: unknown) => value === undefined || value === null ? "" : String(value);
const within = <T>(operation: Promise<T>, milliseconds: number): Promise<T> => Promise.race([
  operation,
  new Promise<T>((_, reject) => setTimeout(() => reject(new Error("confirmation read timed out")), milliseconds)),
]);

/**
 * A GenLayer transaction reaching consensus is not by itself proof that the
 * contract method completed. This checks the persisted contract state (with
 * bounded retries for StudioNet read-after-write lag) before the frontend
 * announces an escrow registration as complete.
 */
async function confirmRegistration(baseAgreementId: string, provider: string, providerFundingTx: string) {
  const normalizedProvider = provider.toLowerCase();
  const normalizedReceipt = providerFundingTx.toLowerCase();
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const ids = await contract.listSlaIdsPostWrite(0, 200);
    for (const slaId of ids) {
      const sla = await contract.getSlaPostWrite(slaId);
      if (text(sla.base_agreement_id) === baseAgreementId
        && text(sla.provider).toLowerCase() === normalizedProvider
        && text(sla.provider_base_funding_tx).toLowerCase() === normalizedReceipt) {
        await upsertSla(slaId, sla);
        return slaId;
      }
    }
    await pause(2_000);
  }
  throw new Error("GenLayer did not persist the linked adjudication record yet");
}

async function confirmFunding(slaId: string, role: "PROVIDER" | "CUSTOMER", baseFundingTx: string) {
  const field = role === "PROVIDER" ? "provider_base_funding_tx" : "customer_base_funding_tx";
  const expected = baseFundingTx.toLowerCase();
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const sla = await contract.getSlaPostWrite(slaId);
    if (text(sla[field]).toLowerCase() === expected) {
      await upsertSla(slaId, sla);
      const providerFunded = text(sla.provider_base_funding_tx) !== "";
      const customerSigned = text(sla.customer_base_funding_tx) !== "";
      return { status: providerFunded && customerSigned ? "ACTIVE" : "PROPOSED" };
    }
    await pause(1_500);
  }
  throw new Error("GenLayer did not persist the Base funding receipt yet");
}

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

  app.get("/protocol/stats", async () => {
    // No monetary state is held on GenLayer. Base escrow totals are indexed
    // separately by the relay service once an escrow deployment is configured.
    return { total_active_escrow_usdc: "0", note: "Base Sepolia escrow totals pending indexer configuration" };
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

  app.post("/slas/confirm-registration", async (request, reply) => {
    const body = request.body as { baseAgreementId?: string; provider?: string; providerFundingTx?: string };
    if (!body.baseAgreementId || !body.provider || !body.providerFundingTx) {
      return reply.code(400).send({ error: "baseAgreementId, provider, and providerFundingTx are required" });
    }
    try {
      // The browser must never spin forever after a signed USDC payment if
      // StudioNet is slow or temporarily unavailable.
      const slaId = await within(confirmRegistration(body.baseAgreementId, body.provider, body.providerFundingTx), 15_000);
      return { slaId };
    } catch (cause) {
      request.log.warn({ cause }, "registration confirmation not found yet");
      return reply.code(409).send({
        error: "Base USDC was confirmed, but GenLayer has not yet produced the matching adjudication record. Do not pay again; refresh this page shortly.",
      });
    }
  });

  app.post("/slas/:slaId/confirm-funding", async (request, reply) => {
    const { slaId } = request.params as { slaId: string };
    const body = request.body as { role?: "PROVIDER" | "CUSTOMER"; baseFundingTx?: string };
    if ((body.role !== "PROVIDER" && body.role !== "CUSTOMER") || !body.baseFundingTx) {
      return reply.code(400).send({ error: "role and baseFundingTx are required" });
    }
    try {
      return await within(confirmFunding(slaId, body.role, body.baseFundingTx), 15_000);
    } catch (cause) {
      request.log.warn({ cause, slaId, role: body.role }, "funding confirmation not found yet");
      return reply.code(409).send({
        error: "Base funding is confirmed, but GenLayer has not yet persisted its receipt. Do not pay again; refresh shortly.",
      });
    }
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

}
