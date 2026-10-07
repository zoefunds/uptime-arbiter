import { prisma } from "../db/client.js";
import { contract } from "../genlayer/client.js";
import { config } from "../config.js";
import { relayResolvedClaim } from "../base/relayer.js";

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
      baseAgreementId: toStr(sla.base_agreement_id),
      provider: toStr(sla.provider),
      customer: toStr(sla.customer),
      label: toStr(sla.label),
      coveredService: toStr(sla.covered_service),
      targetUptimeBps: Number(sla.target_uptime_bps ?? 0),
      graceMinutes: Number(sla.grace_minutes ?? 0),
      // Legacy database column names are retained until the production
      // migration; values are six-decimal Base USDC units from the
      // adjudicator, never a GenLayer balance.
      penaltyRateWeiPerMin: toStr(sla.penalty_rate_usdc_per_min),
      escrowWei: toStr(sla.max_payout_usdc),
      escrowDeposited: toStr(sla.max_payout_usdc),
      bondWei: "0",
      bondDeposited: "0",
      challengeBondWei: "0",
      toleranceMinutes: 0,
      challengeWindowSeconds: 0,
      termSeconds: Number(sla.term_end_ts ?? 0) - Number(sla.term_start_ts ?? 0),
      evidenceSources: toStrArray(sla.evidence_sources),
      exclusionTerms: toStr(sla.exclusion_terms),
      sourceDigest: "",
      adjudicatedWindows: [],
      status: "ACTIVE",
      providerFunded: false,
      customerSigned: false,
      createdAt: "",
      registrationDeadlineTs: BigInt(0),
      termStartTs: toBigInt(sla.term_start_ts),
      termEndTs: toBigInt(sla.term_end_ts),
      activeClaimId: toStr(sla.active_claim_id),
    },
    update: {
      baseAgreementId: toStr(sla.base_agreement_id),
      escrowDeposited: toStr(sla.max_payout_usdc),
      bondDeposited: "0",
      adjudicatedWindows: [],
      status: "ACTIVE",
      providerFunded: false,
      customerSigned: false,
      termStartTs: toBigInt(sla.term_start_ts),
      termEndTs: toBigInt(sla.term_end_ts),
      activeClaimId: toStr(sla.active_claim_id),
    },
  });
}

async function upsertClaim(claimId: string): Promise<void> {
  const claim = await contract.getClaim(claimId);
  // GenLayer's optional `relayed` marker is not controlled by this service.
  // Persist the Base transaction completion locally so a subsequent polling pass
  // can never attempt a second settlement for the same immutable Base escrow.
  const existing = await prisma.claim.findUnique({ where: { claimId }, select: { finalized: true } });
  const finalized = existing?.finalized ?? Boolean(claim.relayed);
  await prisma.claim.upsert({
    where: { claimId },
    create: {
      claimId,
      slaId: toStr(claim.sla_id),
      claimant: toStr(claim.claimant),
      windowStartTs: toBigInt(claim.window_start_ts),
      windowEndTs: toBigInt(claim.window_end_ts),
      pinnedSources: toStrArray(claim.pinned_sources),
      pinnedSourceDigest: "",
      submittedAt: "",
      status: toStr(claim.status),
      breachMinutes: Number(claim.breach_minutes ?? 0),
      inconclusiveReason: toStr(claim.inconclusive_reason),
      recommendedPayoutBps: Number(claim.payout_bps ?? 0),
      payoutWei: toStr(claim.payout_usdc),
      resolvedAt: toStr(claim.resolved_at),
      challengeDeadlineTs: BigInt(0), challengeCount: 0, activeChallengeId: "", isChallenged: false, finalized,
    },
    update: {
      status: toStr(claim.status),
      breachMinutes: Number(claim.breach_minutes ?? 0),
      inconclusiveReason: toStr(claim.inconclusive_reason),
      recommendedPayoutBps: Number(claim.payout_bps ?? 0),
      payoutWei: toStr(claim.payout_usdc),
      resolvedAt: toStr(claim.resolved_at),
      challengeDeadlineTs: BigInt(0), challengeCount: 0, activeChallengeId: "", isChallenged: false, finalized,
    },
  });
  const isResolved = ["RESOLVED_BREACH", "RESOLVED_PARTIAL", "RESOLVED_NO_BREACH"].includes(toStr(claim.status));
  if (isResolved && !finalized) {
    const sla = await contract.getSla(toStr(claim.sla_id));
    const txHash = await relayResolvedClaim({
      baseAgreementId: toStr(sla.base_agreement_id),
      claimId,
      payoutUsdc: toStr(claim.payout_usdc),
      verdict: toStr(claim.status),
    });
    await prisma.claim.update({ where: { claimId }, data: { finalized: true } });
    // eslint-disable-next-line no-console
    console.log(`[relay] ${claimId} settled on Base Sepolia: ${txHash}`);
  }
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

  // Skip rows synced more recently than minRefreshIntervalMs — a
  // non-terminal row can't have changed on-chain since we last read it if
  // barely any time has passed, so re-fetching it just burns budget the
  // API relay layer needs. See config.ts for why this floor exists.
  const staleBefore = new Date(Date.now() - config.indexer.minRefreshIntervalMs);

  const staleSlas = await prisma.slaAgreement.findMany({
    where: { status: { in: NON_TERMINAL_SLA_STATUSES }, syncedAt: { lt: staleBefore } },
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
      syncedAt: { lt: staleBefore },
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
