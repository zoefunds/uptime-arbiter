# Uptime Arbiter v0.9 security and enforceability milestone

## Delivered architecture

This milestone completes the split required by the protocol: **GenLayer adjudicates evidence; Base Sepolia holds, locks, refunds, and distributes USDC.** The backend is an authenticated indexer/relay, never a custody layer. The frontend makes separate Base and GenLayer signatures explicit and treats a transaction as complete only after authoritative receipt/state confirmation.

## Current production contracts

| Layer | Address | Deployment transaction |
| --- | --- | --- |
| GenLayer StudioNet v0.9 adjudicator (current redeployment) | [`0xF6939F08B86162aA26849572f95d6D0147E357B4`](https://explorer-studio.genlayer.com/address/0xF6939F08B86162aA26849572f95d6D0147E357B4) | [`0x450c4736f0ea39f5c5d9dc63809c8ed9d5db5a687036a4f13f7014ef2b678e04`](https://explorer-studio.genlayer.com/transactions/0x450c4736f0ea39f5c5d9dc63809c8ed9d5db5a687036a4f13f7014ef2b678e04) |
| Base Sepolia v0.7 escrow | [`0x8025E0Edd8BF6D27322A07699EB237F7248Dea6A`](https://sepolia.basescan.org/address/0x8025E0Edd8BF6D27322A07699EB237F7248Dea6A) | [`0x88c9a70ed2653e9912d7879ef42ef56eacd2825646c642e56416032741310520`](https://sepolia.basescan.org/tx/0x88c9a70ed2653e9912d7879ef42ef56eacd2825646c642e56416032741310520) |
| Base Sepolia USDC | [`0x036CbD53842c5426634e7929541eC2318f3dCF7e`](https://sepolia.basescan.org/address/0x036CbD53842c5426634e7929541eC2318f3dCF7e) | Circle test token |

The v0.9 deployment finalized with majority validator agreement. Fly (`uptime-arbiter-usdc-api`) and Vercel production use the v0.9/v0.7 pair. `/healthz` was checked after migration and reported `database: true` and `redis: true`.

### 15 October 2026 canonical-source redeployment

The GenLayer adjudicator was redeployed from the currently tested source after
the canonical GitHub incident-parser documentation was corrected. Deployment
[`0x450c…8e04`](https://explorer-studio.genlayer.com/transactions/0x450c4736f0ea39f5c5d9dc63809c8ed9d5db5a687036a4f13f7014ef2b678e04)
finalized with five validator `AGREE` votes at
[`0xF693…57B4`](https://explorer-studio.genlayer.com/address/0xF6939F08B86162aA26849572f95d6D0147E357B4).
Before the switch, the full contract suite passed: 14 Direct Mode tests and 8
Foundry escrow tests. The backend/frontend builds also passed. Base escrow was
not redeployed because its Solidity source and ABI did not change. Production's
non-authoritative index mirror was inspected after the switch: it has zero SLA,
claim, and challenge rows and its sole cursor is already `0/0`; no destructive
database action was performed.

## Reviewer findings closed

| Finding | Remediation |
| --- | --- |
| Validators trusted a leader return shape | Validator code independently fetches every source and compares substantive report data; `gl.vm.Return` alone never passes. |
| Payable minute tolerance could change money | Leader/validator payable minutes must match exactly. |
| Evidence was weakly attributable | Every decision-critical incident needs a quotation found in the fetched source; report preserves URL, fingerprint, service, timestamps, exclusion and quote. |
| Overlaps could inflate downtime | Intervals are unioned before minute rounding. |
| GitHub Status timestamps were over-broad | v0.9 accepts only the canonical official archive host/path, uses update transitions for actual impairment intervals, and excludes qualifying announced maintenance deterministically. |
| Base ID could be globally squatted | Reservation is provider-scoped. Backend authenticates the Base provider, parties, terms hash, deposits and deadlines before indexing/relaying; invalid records are skipped without stalling the cursor. |
| A liable provider could veto then reclaim or loop vetoes | A veto freezes the exact payout. Original-deposit recovery is disabled while disputed; after a 24-hour review, a separate resolver can re-authorize only that same ruling, and the reauthorization is final for that frozen claim. |
| Claims could be future or too fresh | GenLayer enforces completed observation windows, publication lag, service period and filing deadline. |
| Settlement could bypass a challenge | Evaluation is provisional; one counterparty challenge is bounded and finalization waits for the challenge deadline. |
| Expiry could erase an unresolved claim | Base preserves timely open claims through settlement deadline, then refunds original deposits through a bounded recovery path. |
| UI could call a finalized GenLayer error success | The client now requires `FINISHED_WITH_RETURN`; finalized execution errors are surfaced as errors, not timeouts. |
| DB/receipt state could lie | The relay checks Base receipt status and Base state before marking settlement executed. The database is a non-authoritative mirror. |

## Historical v0.8 positive challenged-breach trace

The prior v0.8/v0.5 pair completed the funded trace below. It is retained as historical execution evidence only; its database mirror was cleared before the v0.9/v0.7 migration. No user sessions or authentication records were deleted.

A real, small USDC agreement validated the historical v0.8/v0.5 deployment rather than seeded UI data. v0.9 supersedes its coarse Statuspage timestamps with canonical-host validation, incident-update impairment intervals, and deterministic maintenance exclusions.

| Step | Public reference |
| --- | --- |
| Base agreement 3 provider funding (0.100000 USDC) | [`0xed22eb556a37360458489b8e60e73401d25e8c08c42f1cc1e09173ca90fea533`](https://sepolia.basescan.org/tx/0xed22eb556a37360458489b8e60e73401d25e8c08c42f1cc1e09173ca90fea533) |
| Base agreement 3 customer funding (0.020000 USDC) | [`0x34c6d7436d69ec712c5f03b92da21468afc1905c1a0009bba6b5b57e81bd7a73`](https://sepolia.basescan.org/tx/0x34c6d7436d69ec712c5f03b92da21468afc1905c1a0009bba6b5b57e81bd7a73) |
| v0.8 GenLayer registration, `SLA-1` | [`0x5b44c7b1af3545bf033dfdba7d7b66919f3b9e84dfb0edd138c0e8bc176a31f2`](https://explorer-studio.genlayer.com/transactions/0x5b44c7b1af3545bf033dfdba7d7b66919f3b9e84dfb0edd138c0e8bc176a31f2) |
| Customer funding acknowledgement | [`0xdea9124735f8aa62dd80c7ba232f4527f69d0d10cc94cfa3925b00920d6b2393`](https://explorer-studio.genlayer.com/transactions/0xdea9124735f8aa62dd80c7ba232f4527f69d0d10cc94cfa3925b00920d6b2393) |
| Completed historical claim, `CLM-1` | [`0x912cb01c4cb0b40976fbc774544ff097921fe40ea24c1f1ffd7fa2ff21c4f833`](https://explorer-studio.genlayer.com/transactions/0x912cb01c4cb0b40976fbc774544ff097921fe40ea24c1f1ffd7fa2ff21c4f833) |
| Positive breach evaluation | [`0xf002d56ae78f9caf58ee7a5a85c16eedcd4fed023f63d98895478a1849be54e7`](https://explorer-studio.genlayer.com/transactions/0xf002d56ae78f9caf58ee7a5a85c16eedcd4fed023f63d98895478a1849be54e7) |
| Provider challenge | [`0xc13826eefc9fe8f72315167cb9d1534255be8605356c519b0fa3751518b52013`](https://explorer-studio.genlayer.com/transactions/0xc13826eefc9fe8f72315167cb9d1534255be8605356c519b0fa3751518b52013) |
| Challenged re-resolution | [`0x6a2bd8b9e1ed30d787d3fe9136c19f5249b0c26e75b8ab89a1be12f3fa6908af`](https://explorer-studio.genlayer.com/transactions/0x6a2bd8b9e1ed30d787d3fe9136c19f5249b0c26e75b8ab89a1be12f3fa6908af) |
| Finalized GenLayer ruling | [`0x612b8254f54ee8148a26a115748690dcb9237c1277dfc77cd65d03c461788020`](https://explorer-studio.genlayer.com/transactions/0x612b8254f54ee8148a26a115748690dcb9237c1277dfc77cd65d03c461788020) |
| Backend-authenticated Base settlement proposal | [`0xb10f8e0e4c40e4834ae8196f1914abd44d0982149b995387e813c4984e0ace2d`](https://sepolia.basescan.org/tx/0xb10f8e0e4c40e4834ae8196f1914abd44d0982149b995387e813c4984e0ace2d) |
| Receipt-verified Base execution | [`0x796ea0a1398772f6b4cd15cf34c7904b522c8a9345b13afc63ba43a8fd54ac8b`](https://sepolia.basescan.org/tx/0x796ea0a1398772f6b4cd15cf34c7904b522c8a9345b13afc63ba43a8fd54ac8b) |

The claim covers the completed 12 October 2026 GitHub Actions incident window. Three validators agreed on 474 breach minutes and the contract capped the calculated penalty at **0.100000 USDC** (`payout_usdc=100000`, `payout_bps=10000`). The provider then exercised its one allowed challenge with a fresh official Statuspage representation. Re-resolution independently produced the same payable outcome and digest. The ruling finalized, the backend independently authenticated the Base agreement, and the proposal completed its ten-minute veto window. The backend then submitted the execution transaction above, waited for a successful Base receipt, and read Base state before recording `EXECUTED` at `2026-10-15T13:37:56.507Z`.

## Verification evidence

Executed locally after the v0.8 change:

```text
pytest -q tests/direct/test_uptime_arbiter.py  -> 14 passed
forge test -vvv                                -> 8 passed
backend npm run build                          -> passed
frontend tsc --noEmit + npm run lint           -> passed
```

Direct Mode includes adversarial leader-minute, service, maintenance, quotation, timestamp, spoofed-Statuspage-host, actual-interval, and Base-ID-squatting cases. Foundry includes exact held-balance distributions, mandatory zero-bond acceptance, substituted-claim rejection, near-expiration safety, and a legitimate payout that remains enforceable after a provider veto.

## Operations and frontend behavior

- The frontend switches to Base Sepolia before ERC-20 approvals/funding and to GenLayer for adjudication writes. Submitted → consensus → finalized progress is visible for GenLayer writes.
- Base writes re-read the injected wallet account after switching networks and let that wallet/RPC estimate gas; no fixed client-side gas ceiling can suppress the signing prompt.
- Resolver reauthorization is a separately keyed, receipt-checked operator command—not an API route or automatic relayer action—and can only release the on-chain frozen ruling after review.
- Query surfaces poll every three seconds, refetch on focus/reconnect, and are invalidated after successful writes. Base actions additionally perform a receipt/state readback.
- The registry contains only rows indexed from the active GenLayer address. It no longer displays static “verification scenarios” as SLAs.
- A contract migration requires changing Fly/Vercel address configuration, redeploying both, clearing only `SlaAgreement`, `Claim`, `Challenge`, and index offsets, then resetting the cursor. It never deletes Base escrow history.

## Comparison

The immutable Uptime comparison starts from the requested Uptime baseline, not Obolus:

[`9c45aaf364e0e942b7e3beb2fc16afe8dc836cd2...main`](https://github.com/zoefunds/uptime-arbiter/compare/9c45aaf364e0e942b7e3beb2fc16afe8dc836cd2...main)
