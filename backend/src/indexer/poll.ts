import { prisma } from "../db/client.js";
import { contract } from "../genlayer/client.js";
import { config } from "../config.js";

/**
 * Uptime Arbiter indexer.
 *
 * This process is one of the two "must never die" always-on workloads (the
 * other is the API server). It never authoritatively decides anything — it
 * only mirrors what `contracts/UptimeArbiter.py`'s own view methods already
 * say, into Postgres, so the frontend gets fast paginated reads/history
 * instead of hammering StudioNet directly from every browser tab.
 *
 * Strategy, budgeted against the shared Redis rate limiter
 * (see lib/rateLimiter.ts):
 *   1. Discover NEW sla/claim ids beyond the last known cursor offset and
 *      fetch their full detail once.
 *   2. Re-fetch detail for existing rows whose status is NON-TERMINAL
 *      (still capable of changing) — terminal rows (CONCLUDED/CANCELLED
 *      SLAs, FINALIZED claims, resolved challenges) are never re-fetched
 *      again, which keeps steady-state RPC usage bounded regardless of how
 *      much history accumulates.
 *   3. Every contract read call decrements a per-cycle budget; whatever
 *      doesn't fit this cycle picks up next cycle. Nothing here ever throws
 *      out of the loop — every cycle is wrapped so a single bad response or
 *      a StudioNet hiccup degrades to "try again in pollIntervalMs", never
 *      a crash.
 */

const NON_TERMINAL_SLA_STATUSES = ["PROPOSED", "ACTIVE"];
const RESOLVED_CLAIM_STATUSES = [
  "RESOLVED_BREACH",
  "RESOLVED_PARTIAL",
  "RESOLVED_NO_BREACH",
];

const MAX_RPC_CALLS_PER_CYCLE = 6;

class Budget {
  remaining = MAX_RPC_CALLS_PER_CYCLE;
  has(): boolean {
    return this.remaining > 0;
  }
  spend(): void {
    this.remaining -= 1;
  }
}

function toStrArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  return [];
}

function toStr(v: unknown): string {
  return v === undefined || v === null ? "" : String(v);
}

function toBigInt(v: unknown): bigint {
  try {
    return BigInt(String(v ?? 0));
  } catch {
    return BigInt(0);
  }
}

async function upsertSla(slaId: string): Promise<void> {
  const sla = await contract.getSla(slaId);
  await prisma.slaAgreement.upsert({
    where: { slaId },
    create: {
      slaId,
      provider: toStr(sla.provider),
      customer: toStr(sla.customer),
      label: toStr(sla.label),
      targetUptimeBps: Number(sla.target_uptime_bps ?? 0),
      graceMinutes: Number(sla.grace_minutes ?? 0),
      penaltyRateWeiPerMin: toStr(sla.penalty_rate_wei_per_min),
      escrowWei: toStr(sla.escrow_wei),
      escrowDeposited: toStr(sla.escrow_deposited),
      bondWei: toStr(sla.bond_wei),
      bondDeposited: toStr(sla.bond_deposited),
      challengeBondWei: toStr(sla.challenge_bond_wei),
      toleranceMinutes: Number(sla.tolerance_minutes ?? 0),
      challengeWindowSeconds: Number(sla.challenge_window_seconds ?? 0),
      termSeconds: Number(sla.term_seconds ?? 0),
      evidenceSources: toStrArray(sla.evidence_sources),
      sourceDigest: toStr(sla.source_digest),
      adjudicatedWindows: toStrArray(sla.adjudicated_windows),
      status: toStr(sla.status),
      providerFunded: Boolean(sla.provider_funded),
      customerSigned: Boolean(sla.customer_signed),
      createdAt: toStr(sla.created_at),
      registrationDeadlineTs: toBigInt(sla.registration_deadline_ts),
      termStartTs: toBigInt(sla.term_start_ts),
      termEndTs: toBigInt(sla.term_end_ts),
      activeClaimId: toStr(sla.active_claim_id),
    },
    update: {
      escrowDeposited: toStr(sla.escrow_deposited),
      bondDeposited: toStr(sla.bond_deposited),
      adjudicatedWindows: toStrArray(sla.adjudicated_windows),
      status: toStr(sla.status),
      providerFunded: Boolean(sla.provider_funded),
      customerSigned: Boolean(sla.customer_signed),
      termStartTs: toBigInt(sla.term_start_ts),
      termEndTs: toBigInt(sla.term_end_ts),
      activeClaimId: toStr(sla.active_claim_id),
    },
  });
}

async function upsertClaim(claimId: string): Promise<void> {
  const claim = await contract.getClaim(claimId);
  await prisma.claim.upsert({
    where: { claimId },
    create: {
      claimId,
      slaId: toStr(claim.sla_id),
      claimant: toStr(claim.claimant),
      windowStartTs: toBigInt(claim.window_start_ts),
      windowEndTs: toBigInt(claim.window_end_ts),
      pinnedSources: toStrArray(claim.pinned_sources),
      pinnedSourceDigest: toStr(claim.pinned_source_digest),
      submittedAt: toStr(claim.submitted_at),
      status: toStr(claim.status),
      breachMinutes: Number(claim.breach_minutes ?? 0),
      inconclusiveReason: toStr(claim.inconclusive_reason),
      recommendedPayoutBps: Number(claim.recommended_payout_bps ?? 0),
      payoutWei: toStr(claim.payout_wei),
      resolvedAt: toStr(claim.resolved_at),
      challengeDeadlineTs: toBigInt(claim.challenge_deadline_ts),
      challengeCount: Number(claim.challenge_count ?? 0),
      activeChallengeId: toStr(claim.active_challenge_id),
      isChallenged: Boolean(claim.is_challenged),
      finalized: Boolean(claim.finalized),
    },
    update: {
      status: toStr(claim.status),
      breachMinutes: Number(claim.breach_minutes ?? 0),
      inconclusiveReason: toStr(claim.inconclusive_reason),
      recommendedPayoutBps: Number(claim.recommended_payout_bps ?? 0),
      payoutWei: toStr(claim.payout_wei),
      resolvedAt: toStr(claim.resolved_at),
      challengeDeadlineTs: toBigInt(claim.challenge_deadline_ts),
      challengeCount: Number(claim.challenge_count ?? 0),
      activeChallengeId: toStr(claim.active_challenge_id),
      isChallenged: Boolean(claim.is_challenged),
      finalized: Boolean(claim.finalized),
    },
  });

  const challengeId = toStr(claim.active_challenge_id);
  if (challengeId) {
    await upsertChallenge(challengeId);
  }
}

async function upsertChallenge(challengeId: string): Promise<void> {
  const challenge = await contract.getChallenge(challengeId);
  await prisma.challenge.upsert({
    where: { challengeId },
    create: {
      challengeId,
      claimId: toStr(challenge.claim_id),
      challenger: toStr(challenge.challenger),
      additionalSources: toStrArray(challenge.additional_sources),
      rationale: toStr(challenge.rationale),
      bondWei: toStr(challenge.bond_wei),
      bondDeposited: toStr(challenge.bond_deposited),
      filedAt: toStr(challenge.filed_at),
      resolved: Boolean(challenge.resolved),
      outcome: toStr(challenge.outcome),
      resolvedAt: toStr(challenge.resolved_at),
      priorBreachMinutes: Number(challenge.prior_breach_minutes ?? 0),
      newBreachMinutes: Number(challenge.new_breach_minutes ?? 0),
    },
    update: {
      resolved: Boolean(challenge.resolved),
      outcome: toStr(challenge.outcome),
      resolvedAt: toStr(challenge.resolved_at),
      newBreachMinutes: Number(challenge.new_breach_minutes ?? 0),
      bondDeposited: toStr(challenge.bond_deposited),
    },
  });
}

async function getCursor() {
  return prisma.indexerCursor.upsert({
    where: { id: "default" },
    create: { id: "default" },
    update: {},
  });
}

async function discoverNewSlas(budget: Budget): Promise<void> {
  const cursor = await getCursor();
  let offset = cursor.slaOffset;

  while (budget.has()) {
    const ids = await contract.listSlaIds(offset, config.indexer.pageSize);
    budget.spend();
    if (ids.length === 0) break;

    for (const id of ids) {
      if (!budget.has()) break;
      await upsertSla(id);
      budget.spend();
      offset += 1;
    }
    if (ids.length < config.indexer.pageSize) break;
  }

  if (offset !== cursor.slaOffset) {
    await prisma.indexerCursor.update({ where: { id: "default" }, data: { slaOffset: offset } });
  }
}

async function discoverNewClaims(budget: Budget): Promise<void> {
  const cursor = await getCursor();
  let offset = cursor.claimOffset;

  while (budget.has()) {
    const ids = await contract.listClaimIds(offset, config.indexer.pageSize);
    budget.spend();
    if (ids.length === 0) break;

    for (const id of ids) {
      if (!budget.has()) break;
      await upsertClaim(id);
      budget.spend();
      offset += 1;
    }
    if (ids.length < config.indexer.pageSize) break;
  }

  if (offset !== cursor.claimOffset) {
    await prisma.indexerCursor.update({ where: { id: "default" }, data: { claimOffset: offset } });
  }
}

async function refreshNonTerminal(budget: Budget): Promise<void> {
  if (!budget.has()) return;

  const staleSlas = await prisma.slaAgreement.findMany({
    where: { status: { in: NON_TERMINAL_SLA_STATUSES } },
    orderBy: { syncedAt: "asc" },
    take: budget.remaining,
  });
  for (const row of staleSlas) {
    if (!budget.has()) return;
    await upsertSla(row.slaId);
    budget.spend();
  }

  if (!budget.has()) return;
  const staleClaims = await prisma.claim.findMany({
    where: {
      OR: [
        { status: "PINNED" },
        { AND: [{ status: { in: RESOLVED_CLAIM_STATUSES } }, { finalized: false }] },
      ],
    },
    orderBy: { syncedAt: "asc" },
    take: budget.remaining,
  });
  for (const row of staleClaims) {
    if (!budget.has()) return;
    await upsertClaim(row.claimId);
    budget.spend();
  }

  if (!budget.has()) return;
  const staleChallenges = await prisma.challenge.findMany({
    where: { resolved: false },
    orderBy: { syncedAt: "asc" },
    take: budget.remaining,
  });
  for (const row of staleChallenges) {
    if (!budget.has()) return;
    await upsertChallenge(row.challengeId);
    budget.spend();
  }
}

async function runCycle(): Promise<void> {
  const budget = new Budget();
  await discoverNewSlas(budget);
  await discoverNewClaims(budget);
  await refreshNonTerminal(budget);

  await prisma.indexerCursor.update({
    where: { id: "default" },
    data: { lastRunAt: new Date(), lastError: null, consecutiveErrors: 0 },
  });
}

async function mainLoop(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log("[indexer] starting, contract =", config.genlayer.contractAddress);

  // Never exit. Any uncaught error in a cycle is logged, recorded, and the
  // loop continues after a backoff — this is what "backend must be 24/7"
  // means in practice for a background worker: it survives its own bugs
  // and StudioNet's own hiccups equally.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const cycleStart = Date.now();
    try {
      await runCycle();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // eslint-disable-next-line no-console
      console.error("[indexer] cycle failed:", message);
      try {
        const cursor = await getCursor();
        await prisma.indexerCursor.update({
          where: { id: "default" },
          data: {
            lastError: message.slice(0, 2000),
            consecutiveErrors: cursor.consecutiveErrors + 1,
          },
        });
      } catch {
        // DB itself is unreachable — nothing to do but keep looping.
      }
    }

    const elapsed = Date.now() - cycleStart;
    const delay = Math.max(0, config.indexer.pollIntervalMs - elapsed);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

process.on("unhandledRejection", (reason) => {
  // eslint-disable-next-line no-console
  console.error("[indexer] unhandled rejection (continuing):", reason);
});
process.on("uncaughtException", (err) => {
  // eslint-disable-next-line no-console
  console.error("[indexer] uncaught exception (continuing):", err);
});

mainLoop();
