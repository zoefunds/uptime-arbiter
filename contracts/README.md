# `UptimeArbiter.py` — Contract Reference

Single Intelligent Contract, ~1,550 lines. This is the interface reference;
for the trust-boundary and escrow-discipline design rationale, see the
root [`README.md`](../README.md) and the contract's own inline comments
(`_run_breach_consensus` and `_compute_settlement` are the two functions to
start with).

Every parameter/return type below is extracted directly from the current
file via `genvm-lint schema contracts/UptimeArbiter.py`, not hand-typed —
run that command yourself if this ever needs re-verifying after an edit.

**Deployed at**: `0x61D6F3bdf53118523572a141F7E1904591147F94` on GenLayer
StudioNet (chain id `61999`). See root `MEMORY.md` for the deployment
history — earlier addresses (`0x6bd7064ECc72704D156FF5D34B2C7C3fEf9946c6`,
`0xdeBf80793BD1145B9D195eeD311a01Ba25Eb09d1`, `0x8aB7b78e29D9af2b66A7B01E1D41E56Fb6595614`)
are dead and must never be referenced.

## Verifying before you deploy

```bash
pip install genvm-linter
genvm-lint check contracts/UptimeArbiter.py --json     # lint + SDK validation
genvm-lint typecheck contracts/UptimeArbiter.py --json # Pyright
genvm-lint schema contracts/UptimeArbiter.py --json    # ABI extraction — must succeed,
                                                        # or the deployed contract will hit
                                                        # "could not load contract schema"
```

All three must pass clean. See `tests/README.md` for the direct-mode test suite.

## Write methods

| Method | Params | Payable | Caller | Notes |
|---|---|---|---|---|
| `propose_sla` | `customer, label, covered_service, target_uptime_bps, penalty_rate_wei_per_min, escrow_wei, bond_wei, challenge_bond_wei, tolerance_minutes, challenge_window_seconds, term_seconds, registration_ttl_seconds, evidence_sources, exclusion_terms` | No | anyone (becomes provider) | Pins terms + evidence sources + exclusion terms + the covered-service identity. `grace_minutes` is NOT a parameter — it's derived on-chain as `term_minutes × (1 − target_uptime_bps)`, so the stated uptime target always materially affects settlement (see `MATERIAL EFFECT OF target_uptime_bps` in the contract). Returns the new `sla_id`. No funds move. |
| `lock_provider_escrow` | `sla_id` | Yes — exact `escrow_wei` | the proposing provider | First of two funding calls. |
| `co_sign_and_lock_bond` | `sla_id, expected_source_digest` | Yes — exact `bond_wei` (or 0) | the named customer | `expected_source_digest` must match `get_sla(sla_id).source_digest` exactly, or it reverts — this is the customer's confirmation they're approving the exact pinned source list. SLA goes `ACTIVE` once both funding calls have landed, in either order. |
| `cancel_sla` | `sla_id` | No | provider or customer | Only while `PROPOSED`. Refunds whichever side already deposited. |
| `reclaim_stale_proposal` | `sla_id` | No | anyone | Same refund as `cancel_sla`, but callable by anyone once `registration_deadline_ts` has passed — the recovery path if a counterparty goes silent before activation. |
| `submit_claim` | `sla_id, window_start_ts, window_end_ts` | No | the SLA's customer | Only while `ACTIVE` and no claim already open. Pins the window immediately; the evidence-source snapshot is taken at this moment, before any evaluation. Returns the new `claim_id`. |
| `evaluate_claim` | `claim_id` | No | anyone (permissionless) | Runs the independent multi-validator fetch + Equivalence Principle check, then the deterministic settlement calc. Resolves to `RESOLVED_BREACH` / `RESOLVED_PARTIAL` / `RESOLVED_NO_BREACH` / `INCONCLUSIVE`. |
| `file_challenge` | `claim_id, additional_sources, rationale` | Yes — exact `challenge_bond_wei` | provider or customer | Only on a resolved, non-finalized, non-already-challenged claim, before `challenge_deadline_ts`. Sources are additive only — duplicating an original pinned source reverts. Returns the new `challenge_id`. |
| `resolve_challenge` | `challenge_id` | No | anyone (permissionless) | Re-runs the full evaluation over the original + additional sources combined. Outcome is `UPHELD_ORIGINAL` (challenger's bond slashed to the counterparty), `OVERTURNED` (settlement recomputed, bond refunded to challenger), or `INCONCLUSIVE_RETRY` (bond refunded, original verdict stands — the re-adjudication itself couldn't reach quorum). |
| `finalize_claim` | `claim_id` | No | anyone (permissionless) | Only once resolved, not challenged, and past `challenge_deadline_ts`. Zeroes the SLA's escrow/bond ledger and credits both parties' withdrawable balances per the verdict. |
| `terminate_expired_sla` | `sla_id` | No | anyone (permissionless) | Only once `ACTIVE` with no open claim and past `term_end_ts`. Returns escrow to the provider and bond to the customer. |
| `withdraw` | *(none)* | No | anyone with a balance | The only method that ever calls `_send_gen`. Zeroes the caller's withdrawable balance before transferring. |

## View methods

| Method | Returns |
|---|---|
| `get_sla(sla_id)` | Full SLA state — see field list below. |
| `get_claim(claim_id)` | Full claim state. |
| `get_challenge(challenge_id)` | Full challenge state. |
| `get_withdrawable_balance(address)` | Wei string. |
| `list_sla_ids(offset, limit)` | Paginated array of ids, max page size 200. |
| `list_claim_ids(offset, limit)` | Same, for claims. |
| `get_protocol_config()` | The protocol-wide bounds (min/max evidence sources, tolerance, challenge window, penalty rate, etc.) — see `PROTOCOL BOUNDS` in the contract for the authoritative numbers. |
| `get_protocol_stats()` | Running totals: active escrow, SLAs registered/active, claims by verdict, challenges filed/overturned — all O(1) counters, never a scan. |

## `get_sla` fields

```
sla_id, provider, customer, label, covered_service, target_uptime_bps,
grace_minutes, penalty_rate_wei_per_min, escrow_wei, escrow_deposited,
bond_wei, bond_deposited, challenge_bond_wei, tolerance_minutes,
challenge_window_seconds, term_seconds, evidence_sources, exclusion_terms,
source_digest, adjudicated_windows, status, provider_funded,
customer_signed, created_at, registration_deadline_ts, term_start_ts,
term_end_ts, active_claim_id
```

`*_wei` fields are the agreed **terms**; `*_deposited` fields are the
actual **ledger** — settlement logic only ever reads the latter. `status`
is one of `PROPOSED / ACTIVE / CONCLUDED / CANCELLED` — note that
`finalize_claim` always transitions an `ACTIVE` SLA to `CONCLUDED`; a
settled claim consumes the SLA's escrow relationship rather than leaving
it `ACTIVE` with a zeroed ledger (which would let a second, unfunded claim
be pinned). `grace_minutes` is derived, not user-supplied — see
`propose_sla` above.

## `get_claim` fields

```
claim_id, sla_id, claimant, window_start_ts, window_end_ts, pinned_sources,
pinned_source_digest, submitted_at, status, breach_minutes,
inconclusive_reason, recommended_payout_bps, payout_wei, resolved_at,
challenge_deadline_ts, challenge_count, active_challenge_id, is_challenged,
finalized
```

`status` is one of `PINNED / RESOLVED_BREACH / RESOLVED_PARTIAL /
RESOLVED_NO_BREACH / INCONCLUSIVE`.

## `get_challenge` fields

```
challenge_id, claim_id, challenger, additional_sources, rationale,
bond_wei, bond_deposited, filed_at, resolved, outcome, resolved_at,
prior_breach_minutes, new_breach_minutes
```

`outcome` is one of `PENDING / UPHELD_ORIGINAL / OVERTURNED /
INCONCLUSIVE_RETRY`.

## Protocol bounds (current values — call `get_protocol_config()` for the live source of truth)

| Bound | Value |
|---|---|
| Evidence sources per SLA | 3–8 |
| Covered service identifier length | 1–200 characters |
| Target uptime | 50%–100% (5,000–10,000 bps) |
| Equivalence tolerance | 0–30 minutes |
| Challenge window | 24h – 14 days |
| SLA term length | 1 day – ~1 year |
| Registration deadline (time to co-sign) | 1h – 30 days |
| Penalty rate | 1 wei – 10,000 GEN per minute |
| Minimum escrow | 0.001 GEN |
| Minimum challenge bond | 5% of escrow |
| Additional sources per challenge | 1–2 |
| Challenge rounds per claim | max 2 |

These exist to keep the contract usable without being so strict that
ordinary SLAs get rejected or minor validator timing differences cause an
undetermined consensus result — see `PROTOCOL BOUNDS` in the contract
source for the reasoning behind each one.
