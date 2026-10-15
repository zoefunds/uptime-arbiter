# Uptime Arbiter v0.7 security and enforceability milestone

## Delivered architecture

This milestone completes the split required by the protocol: **GenLayer adjudicates evidence; Base Sepolia holds, locks, refunds, and distributes USDC.** The backend is an authenticated indexer/relay, never a custody layer. The frontend makes separate Base and GenLayer signatures explicit and treats a transaction as complete only after authoritative receipt/state confirmation.

## Current production contracts

| Layer | Address | Deployment transaction |
| --- | --- | --- |
| GenLayer StudioNet v0.7 adjudicator | [`0xDF4Ee826F8ffAEC8c11B5eaB3b35D6B3812E1e57`](https://explorer-studio.genlayer.com/address/0xDF4Ee826F8ffAEC8c11B5eaB3b35D6B3812E1e57) | [`0x036890a911c0308a62c902400929fa486fec2d372aa26b0422bb4bd84c075448`](https://explorer-studio.genlayer.com/transactions/0x036890a911c0308a62c902400929fa486fec2d372aa26b0422bb4bd84c075448) |
| Base Sepolia v0.5 escrow | [`0x3648226dfaBFE79A1Cf0B708880176904b7b1b6c`](https://sepolia.basescan.org/address/0x3648226dfaBFE79A1Cf0B708880176904b7b1b6c) | [`0xd4e697a31bd63eed8d366f785148479864cb6284aa2c77796279aab1390bdc80`](https://sepolia.basescan.org/tx/0xd4e697a31bd63eed8d366f785148479864cb6284aa2c77796279aab1390bdc80) |
| Base Sepolia USDC | [`0x036CbD53842c5426634e7929541eC2318f3dCF7e`](https://sepolia.basescan.org/address/0x036CbD53842c5426634e7929541eC2318f3dCF7e) | Circle test token |

The v0.7 deployment finalized with majority validator agreement. Fly (`uptime-arbiter-usdc-api`) and Vercel production both use the v0.7 address. `/healthz` was checked after deployment and reported `database: true` and `redis: true`.

## Reviewer findings closed

| Finding | Remediation |
| --- | --- |
| Validators trusted a leader return shape | Validator code independently fetches every source and compares substantive report data; `gl.vm.Return` alone never passes. |
| Payable minute tolerance could change money | Leader/validator payable minutes must match exactly. |
| Evidence was weakly attributable | Every decision-critical incident needs a quotation found in the fetched source; report preserves URL, fingerprint, service, timestamps, exclusion and quote. |
| Overlaps could inflate downtime | Intervals are unioned before minute rounding. |
| GitHub Status timestamps were model-dependent | v0.7 deterministically parses public Statuspage JSON with a validator-portable RFC3339 parser for GitHub Actions incident title/component/timestamps. |
| Base ID could be globally squatted | Reservation is provider-scoped. Backend authenticates the Base provider, parties, terms hash, deposits and deadlines before indexing/relaying; invalid records are skipped without stalling the cursor. |
| Relayer could repeat after veto | `Disputed` is append-only Base status; veto marks the claim disputed and future proposals for it fail. Funds remain recoverable after the settlement deadline. |
| Claims could be future or too fresh | GenLayer enforces completed observation windows, publication lag, service period and filing deadline. |
| Settlement could bypass a challenge | Evaluation is provisional; one counterparty challenge is bounded and finalization waits for the challenge deadline. |
| Expiry could erase an unresolved claim | Base preserves timely open claims through settlement deadline, then refunds original deposits through a bounded recovery path. |
| UI could call a finalized GenLayer error success | The client now requires `FINISHED_WITH_RETURN`; finalized execution errors are surfaced as errors, not timeouts. |
| DB/receipt state could lie | The relay checks Base receipt status and Base state before marking settlement executed. The database is a non-authoritative mirror. |

## Live v0.6 diagnostic trace and v0.7 remediation

The previous contract mirror was cleared before indexing this deployment: 0 SLAs, 0 claims, 0 challenges, with offsets reset to zero. No user sessions or authentication records were deleted.

A real, small USDC agreement is being used to validate the new contract rather than seeded UI data:

| Step | Public reference |
| --- | --- |
| Base agreement 2 provider funding (0.100000 USDC) | [`0x3435571dafc073b4af21acde22ca710e26cb98ef5ccbbcc07d7b5ee03caee9b1`](https://sepolia.basescan.org/tx/0x3435571dafc073b4af21acde22ca710e26cb98ef5ccbbcc07d7b5ee03caee9b1) |
| Base agreement 2 customer funding (0.020000 USDC) | [`0xc4e0924d949342ce598e8fdf62a3857e6a8ba9bf82e42af97af8bca3d70d90c2`](https://sepolia.basescan.org/tx/0xc4e0924d949342ce598e8fdf62a3857e6a8ba9bf82e42af97af8bca3d70d90c2) |
| GenLayer registration, `SLA-1` | [`0x38bf07f93f44593715560316df0a7839fe73d0d6d6bc707ad38873c6fcfc651f`](https://explorer-studio.genlayer.com/transactions/0x38bf07f93f44593715560316df0a7839fe73d0d6d6bc707ad38873c6fcfc651f) |
| GenLayer customer funding acknowledgement | [`0xd7e394e5820bde4293d13ebe86408f98c1647514698364912c31fa2afa044e64`](https://explorer-studio.genlayer.com/transactions/0xd7e394e5820bde4293d13ebe86408f98c1647514698364912c31fa2afa044e64) |
| Completed historical GitHub Actions claim, `CLM-1` | [`0xe053c1d3e2a7c389d9af5c871e41a057a48cbe541972369f94810379056fb584`](https://explorer-studio.genlayer.com/transactions/0xe053c1d3e2a7c389d9af5c871e41a057a48cbe541972369f94810379056fb584) |
| Evidence evaluation submitted | [`0x50992d1710826bd0b18897ccdeed226f7cf4fb88c78b337ad99716cd642d54bc`](https://explorer-studio.genlayer.com/transactions/0x50992d1710826bd0b18897ccdeed226f7cf4fb88c78b337ad99716cd642d54bc) |

The claim covers the completed 12 October 2026 GitHub Actions incident window. Its sources are official `githubstatus.com` Statuspage incident representations. The v0.6 evaluation finalized as `MAJORITY_DISAGREE` without mutating the claim; its receipt revealed that the validator image did not reliably support the original date conversion. v0.7 replaces that conversion with a contract-local deterministic RFC3339 parser. This document intentionally does **not** claim a payout, challenge resolution, or Base settlement from the failed diagnostic evaluation.

## Verification evidence

Executed locally after the v0.7 change:

```text
pytest -q tests/direct/test_uptime_arbiter.py  -> 12 passed
forge test -vvv                                -> 7 passed
backend npm run build                          -> passed
frontend tsc --noEmit + npm run lint           -> passed
```

Direct Mode includes adversarial leader-minute, service, maintenance, quotation, timestamp, and Base-ID-squatting cases, plus the Statuspage extractor and overlap case. Foundry includes exact held-balance distributions, mandatory zero-bond acceptance, substituted-claim rejection, unresolved-claim recovery, and a durable-veto regression.

## Operations and frontend behavior

- The frontend switches to Base Sepolia before ERC-20 approvals/funding and to GenLayer for adjudication writes. Submitted → consensus → finalized progress is visible for GenLayer writes.
- Query surfaces poll every three seconds, refetch on focus/reconnect, and are invalidated after successful writes. Base actions additionally perform a receipt/state readback.
- The registry contains only rows indexed from the active GenLayer address. It no longer displays static “verification scenarios” as SLAs.
- A contract migration requires changing Fly/Vercel address configuration, redeploying both, clearing only `SlaAgreement`, `Claim`, `Challenge`, and index offsets, then resetting the cursor. It never deletes Base escrow history.

## Comparison

The Uptime comparison starts from the requested Uptime baseline, not Obolus:

[`9c45aaf364e0e942b7e3beb2fc16afe8dc836cd2...main`](https://github.com/zoefunds/uptime-arbiter/compare/9c45aaf364e0e942b7e3beb2fc16afe8dc836cd2...main)

After the final push, use the immutable full-SHA end commit in place of `main` for a fixed review link.
