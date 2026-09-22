# Review Response

This document records the fixes made in response to the team's review feedback:

> "Please update the contract so the agreed uptime target and a pinned covered-service identity materially affect evidence evaluation or settlement, unrelated or low-confidence results are excluded from quorum as inconclusive instead of counted as zero downtime, and finalization either concludes the SLA or blocks further claims until both deposits are replenished. Add focused contract tests for different target terms, unusable sources, and a second claim after finalization."

All four issues were fixed in `contracts/UptimeArbiter.py`, covered by 4 new direct-mode tests, and verified live on a redeployed contract.

## 1. `target_uptime_bps` was stored but never used

**Problem**: `grace_minutes` was a fully independent, free-form input to `propose_sla`. A provider/customer could agree to a 99.99% uptime target while separately setting an enormous `grace_minutes`, making the stated target purely decorative — it never actually affected evaluation or settlement.

**Fix**: `grace_minutes` is now derived on-chain from `target_uptime_bps` and `term_seconds`, and removed entirely as a `propose_sla` parameter:

```
term_minutes = term_seconds // 60
grace_minutes = (term_minutes * (BPS_DENOMINATOR - target_uptime_bps)) // BPS_DENOMINATOR
```

Added `MIN_TARGET_UPTIME_BPS = 5_000` (50%) so a degenerate near-0% "uptime target" can't push the derived grace past the protocol's `MAX_GRACE_MINUTES` ceiling. Also added `MIN_TARGET_UPTIME_BPS <= target_uptime_bps <= BPS_DENOMINATOR` validation.

## 2. No pinned service identity

**Problem**: Evidence sources are often shared status pages covering multiple services (e.g. a cloud provider's regional status feed). Without a pinned service identity, an incident affecting an unrelated service on the same status page could be miscounted against this SLA.

**Fix**: Added `covered_service: str` as a required `propose_sla` parameter, pinned at registration exactly like the evidence sources and exclusion terms. It's threaded through `_extract_breach_minutes_for_source`'s prompt so each independent validator explicitly checks relevance to the covered service before counting any downtime.

## 3. Unrelated/low-confidence sources counted as zero downtime

**Problem**: `_coerce_breach_minutes` treated any source it couldn't confidently parse as "0 breach minutes" — indistinguishable from "confirmed no incident." This systematically biased every noisy or off-topic source toward the provider (never toward a breach finding).

**Fix**: The evaluation prompt now requires a `usable: bool` field in the model's structured response. `_coerce_breach_minutes` checks `usable`/`confidence` first and returns the same inconclusive sentinel used for unreachable sources whenever a source is marked unusable or low-confidence — these sources are excluded from the quorum entirely rather than silently passing it with a wrong answer.

## 4. `finalize_claim` never concluded the SLA

**Problem**: `finalize_claim` zeroed `escrow_deposited`/`bond_deposited` and cleared `active_claim_id`, but left `sla.status` at `ACTIVE`. This allowed a customer to submit a *second* claim against an SLA with zero GEN behind it — `evaluate_claim` would run to completion and produce a verdict, but every payout would silently be zero regardless (since `_compute_settlement` caps at `escrow_deposited`).

**Fix**: `finalize_claim` now sets `sla.status = SLA_STATUS_CONCLUDED`. A second `submit_claim` against the same SLA correctly reverts with `"SLA is not ACTIVE"` instead of proceeding to a meaningless evaluation.

## Tests added

4 new focused tests (39 total in `tests/direct/`, all passing):

- **`test_target_uptime_bps_materially_changes_settlement`** — same term length, two different targets, identical agreed breach → different derived grace → different verdicts/settlement.
- **`test_covered_service_is_passed_into_the_evaluation_prompt`** — confirms `covered_service` reaches the LLM evaluation prompt.
- **`test_unusable_sources_excluded_from_quorum_not_counted_as_zero`** — 1 usable + 2 unusable out of 3 sources must resolve `INCONCLUSIVE`, not falsely reach quorum on the unusable readings.
- **`test_unusable_sources_still_reach_quorum_when_majority_is_usable`** — the complement: 2 usable + 1 unusable DOES reach quorum, computed only from the usable readings.
- **`test_finalize_concludes_the_sla_and_blocks_a_second_claim`** — replaces the old `test_cannot_reclaim_the_same_adjudicated_window_twice`, whose assumption that the SLA stayed `ACTIVE` after finalize was itself the bug.

## Downstream changes required

The `propose_sla` signature change (removed `grace_minutes`, added `covered_service`) rippled beyond the contract:

- `tests/direct/conftest.py` — `propose_default_sla` helper updated to the new signature.
- `frontend/src/app/register/page.tsx` — removed the Grace input, added a Covered Service field, added a client-side derived-grace preview that mirrors the contract's formula (the contract remains the authoritative source).
- `frontend/src/app/registry/[slaId]/page.tsx` — added a Covered Service field, relabeled Grace as "Grace (derived)".
- `frontend/src/lib/api.ts` — added `coveredService` to the `SlaRow` type.
- `backend/prisma/schema.prisma` + `backend/src/indexer/poll.ts` — added `coveredService` column/mapping (new migration `add_covered_service`).

## Live redeployment and end-to-end verification

The fixed contract was redeployed to GenLayer StudioNet at `0x61D6F3bdf53118523572a141F7E1904591147F94`. Verification steps:

1. Cleared the previous contract's indexed rows from Postgres (`SlaAgreement`/`Claim`/`Challenge` + `IndexerCursor`) so no stale data from the old deployment could appear.
2. Rewired the new address into all env files, the `uptime-arbiter-api` Fly secret, and the Vercel `NEXT_PUBLIC_CONTRACT_ADDRESS` env var, redeploying both backend and frontend.
3. Ran a real, live `propose_sla` call against the new contract (`backend/scripts/e2e-propose-sla.mjs`, using freshly generated GenLayer accounts, real evidence source URLs, real exclusion terms, and a real covered-service string) — transaction `0x9850777edfff7c06b9fc0cded9d670f8a53637908599f49e1f37ff3ea5bddd6a`, status `ACCEPTED`.
4. Read back `get_sla("SLA-1")` directly from the contract and confirmed `covered_service` was pinned correctly and `grace_minutes` was derived correctly (43 minutes, for a 99.90% target over a 30-day term — matching the on-chain formula exactly).
5. Confirmed the same data renders correctly on the live frontend at `/registry/SLA-1`.

This confirms the fixes are not just unit-tested but function correctly on a live, redeployed contract with real transactions.
