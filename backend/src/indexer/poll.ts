import { prisma } from "../db/client.js";
import { contract } from "../genlayer/client.js";
import { config } from "../config.js";
import { assertBoundAgreement, readBaseAgreement, reconcileResolvedClaim } from "../base/relayer.js";

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

const NON_TERMINAL_SLA_STATUSES = ["PROPOSED", "ACTIVE", "SETTLEMENT_PENDING", "DISPUTED"];

function registryStatus(baseStatus: number | undefined, providerFunded: boolean, customerSigned: boolean) {
  if (baseStatus === 2) return "SETTLEMENT_PENDING";
  if (baseStatus === 3 || baseStatus === 5) return "CONCLUDED";
  if (baseStatus === 4) return "CANCELLED";
  if (baseStatus === 6) return "DISPUTED";
  if (baseStatus === 1) return "ACTIVE";
  return providerFunded && customerSigned ? "ACTIVE" : "PROPOSED";
}
const SETTLEMENT_CLAIM_STATUSES = ["FINALIZED_BREACH", "FINALIZED_PARTIAL", "FINALIZED_NO_BREACH"];

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

/** Used by the post-write confirmation route as well as the background poller. */
export async function upsertSla(slaId: string, knownSla?: Record<string, unknown>): Promise<void> {
  const sla = knownSla ?? await contract.getSla(slaId);
  let baseAgreement: Awaited<ReturnType<typeof readBaseAgreement>> | undefined;
  const baseAgreementId = toStr(sla.base_agreement_id);
  if (baseAgreementId) {
    baseAgreement = await readBaseAgreement(baseAgreementId);
    // Never mirror a caller-fabricated or conflicting GenLayer record. A
    // temporary Base RPC failure retries the whole index cycle; a binding
    // mismatch remains rejected until the underlying state genuinely agrees.
    assertBoundAgreement({
      agreement: baseAgreement,
      provider: toStr(sla.provider), customer: toStr(sla.customer),
      maxPayoutUsdc: toStr(sla.max_payout_usdc), customerBondUsdc: toStr(sla.customer_bond_usdc),
      serviceEnd: toStr(sla.term_end_ts), claimDeadline: toStr(sla.claim_deadline_ts),
      settlementDeadline: toStr(sla.settlement_deadline_ts), termsHash: toStr(sla.base_terms_hash),
    });
  }
  const providerFunded = toStr(sla.provider_base_funding_tx) !== "";
  const customerSigned = toStr(sla.customer_base_funding_tx) !== "";
  // The GenLayer contract records funding receipts but does not custody
  // USDC. Derive the registry lifecycle honestly: an agreement is active
  // only after both Base-side funding acknowledgements exist.
  // Base is the custody/lifecycle authority. GenLayer funding receipts prove
  // the cross-chain acknowledgment, but cannot keep a refunded or settled
  // escrow looking ACTIVE in the registry.
  const status = registryStatus(baseAgreement === undefined ? undefined : Number(baseAgreement.status), providerFunded, customerSigned);
  await prisma.slaAgreement.upsert({
    where: { slaId },
    create: {
      slaId,
      baseAgreementId: toStr(sla.base_agreement_id),
      baseTermsHash: toStr(sla.base_terms_hash),
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
      escrowWei: baseAgreement?.escrowUsdc.toString() ?? toStr(sla.max_payout_usdc),
      escrowDeposited: baseAgreement?.providerDeposited.toString() ?? "0",
      bondWei: baseAgreement?.customerBondUsdc.toString() ?? toStr(sla.customer_bond_usdc),
      bondDeposited: baseAgreement?.customerDeposited.toString() ?? "0",
      challengeBondWei: "0",
      toleranceMinutes: 0,
      challengeWindowSeconds: Number(sla.challenge_window_seconds ?? 0),
      termSeconds: Number(sla.term_end_ts ?? 0) - Number(sla.term_start_ts ?? 0),
      evidenceSources: toStrArray(sla.evidence_sources),
      exclusionTerms: toStr(sla.exclusion_terms),
      sourceDigest: "",
      adjudicatedWindows: [],
      status,
      providerFunded,
      customerSigned,
      createdAt: "",
      registrationDeadlineTs: BigInt(0),
      termStartTs: toBigInt(sla.term_start_ts),
      termEndTs: toBigInt(sla.term_end_ts),
      claimDeadlineTs: toBigInt(sla.claim_deadline_ts),
      settlementDeadlineTs: toBigInt(sla.settlement_deadline_ts),
      publicationLagSeconds: Number(sla.publication_lag_seconds ?? 0),
      activeClaimId: toStr(sla.active_claim_id),
    },
    update: {
      baseAgreementId: toStr(sla.base_agreement_id),
      baseTermsHash: toStr(sla.base_terms_hash),
      ...(baseAgreement ? {
        escrowWei: baseAgreement.escrowUsdc.toString(),
        escrowDeposited: baseAgreement.providerDeposited.toString(),
        bondWei: baseAgreement.customerBondUsdc.toString(),
        bondDeposited: baseAgreement.customerDeposited.toString(),
      } : {}),
      adjudicatedWindows: [],
      status,
      providerFunded,
      customerSigned,
      termStartTs: toBigInt(sla.term_start_ts),
      termEndTs: toBigInt(sla.term_end_ts),
      claimDeadlineTs: toBigInt(sla.claim_deadline_ts),
      settlementDeadlineTs: toBigInt(sla.settlement_deadline_ts),
      publicationLagSeconds: Number(sla.publication_lag_seconds ?? 0),
      challengeWindowSeconds: Number(sla.challenge_window_seconds ?? 0),
      activeClaimId: toStr(sla.active_claim_id),
    },
  });
}

export async function upsertClaim(claimId: string, knownClaim?: Record<string, unknown>): Promise<void> {
  const claim = knownClaim ?? await contract.getClaim(claimId);
  const existing = await prisma.claim.findUnique({ where: { claimId } });
  const finalized = existing?.finalized ?? false;
  const challengeCount = Number(claim.challenge_count ?? 0);
  const challengeId = challengeCount > 0 ? `CH-${claimId}` : "";
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
      resolvedAt: toStr(claim.finalized_at_ts),
      challengeDeadlineTs: toBigInt(claim.challenge_deadline_ts), challengeCount,
      activeChallengeId: challengeId, isChallenged: toStr(claim.status) === "CHALLENGED", finalized,
      evidenceReportJson: toStr(claim.evidence_report_json), evidenceDigest: toStr(claim.evidence_digest),
      evaluatedAtTs: toBigInt(claim.evaluated_at_ts), settlementStatus: existing?.settlementStatus ?? "NOT_READY",
    },
    update: {
      status: toStr(claim.status),
      breachMinutes: Number(claim.breach_minutes ?? 0),
      inconclusiveReason: toStr(claim.inconclusive_reason),
      recommendedPayoutBps: Number(claim.payout_bps ?? 0),
      payoutWei: toStr(claim.payout_usdc),
      resolvedAt: toStr(claim.finalized_at_ts),
      challengeDeadlineTs: toBigInt(claim.challenge_deadline_ts), challengeCount,
      activeChallengeId: challengeId, isChallenged: toStr(claim.status) === "CHALLENGED", finalized,
      evidenceReportJson: toStr(claim.evidence_report_json), evidenceDigest: toStr(claim.evidence_digest),
      evaluatedAtTs: toBigInt(claim.evaluated_at_ts),
    },
  });
  if (challengeCount > 0) {
    await prisma.challenge.upsert({
      where: { challengeId },
      create: {
        challengeId, claimId, challenger: toStr(claim.challenger),
        additionalSources: toStrArray(claim.challenge_sources), rationale: toStr(claim.challenge_rationale),
        bondWei: "0", bondDeposited: "0", filedAt: "", resolved: toStr(claim.status) !== "CHALLENGED",
        outcome: toStr(claim.status), resolvedAt: toStr(claim.evaluated_at_ts),
        priorBreachMinutes: 0, newBreachMinutes: Number(claim.breach_minutes ?? 0),
      },
      update: {
        resolved: toStr(claim.status) !== "CHALLENGED", outcome: toStr(claim.status),
        resolvedAt: toStr(claim.evaluated_at_ts), newBreachMinutes: Number(claim.breach_minutes ?? 0),
      },
    });
  }
  if (SETTLEMENT_CLAIM_STATUSES.includes(toStr(claim.status)) && !finalized) {
    const sla = await contract.getSla(toStr(claim.sla_id));
    const result = await reconcileResolvedClaim({
      baseAgreementId: toStr(sla.base_agreement_id),
      claimId,
      evidenceDigest: toStr(claim.evidence_digest), penaltyPayoutUsdc: toStr(claim.payout_usdc),
      provider: toStr(sla.provider), customer: toStr(sla.customer),
      maxPayoutUsdc: toStr(sla.max_payout_usdc), customerBondUsdc: toStr(sla.customer_bond_usdc),
      serviceEnd: toStr(sla.term_end_ts), claimDeadline: toStr(sla.claim_deadline_ts),
      settlementDeadline: toStr(sla.settlement_deadline_ts), termsHash: toStr(sla.base_terms_hash),
    });
    await prisma.claim.update({ where: { claimId }, data: {
      finalized: result.status === "EXECUTED",
      settlementStatus: result.status,
      ...(result.status === "PROPOSED" && result.txHash ? { settlementProposedTx: result.txHash } : {}),
      ...(result.status === "EXECUTED" && result.txHash ? { settlementExecutedTx: result.txHash } : {}),
    } });
    console.log(`[relay] ${claimId} Base settlement state: ${result.status}${result.txHash ? ` ${result.txHash}` : ""}`);
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
      try {
        await upsertSla(id);
      } catch (cause) {
        // A caller can write an untrusted GenLayer record, but it must never
        // become an indexer cursor DoS that prevents discovery of the real
        // Base-provider registration behind it. Keep it out of Postgres and
        // advance the immutable on-chain ID cursor.
        console.warn(`[indexer] ignoring unauthenticated SLA ${id}:`, cause);
      }
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
        { status: { in: ["PINNED", "CHALLENGED", "PROVISIONAL_BREACH", "PROVISIONAL_PARTIAL", "PROVISIONAL_NO_BREACH", "PROVISIONAL_INCONCLUSIVE"] } },
        { AND: [{ status: { in: SETTLEMENT_CLAIM_STATUSES } }, { finalized: false }] },
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

// This module also exports the one authoritative cache-upsert routine for
// post-write API confirmation. Do not start a second infinite indexer loop
// inside the Fastify process when that routine is imported there.
const isIndexerEntrypoint = /(?:^|\/)indexer\/poll\.(?:js|ts)$/.test(process.argv[1] ?? "");
if (isIndexerEntrypoint) {
  process.on("unhandledRejection", (reason) => {
    // eslint-disable-next-line no-console
    console.error("[indexer] unhandled rejection (continuing):", reason);
  });
  process.on("uncaughtException", (err) => {
    // eslint-disable-next-line no-console
    console.error("[indexer] uncaught exception (continuing):", err);
  });
  void mainLoop();
}
