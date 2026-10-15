# Uptime Arbiter v0.8 security and enforceability milestone

## Delivered architecture

This milestone completes the split required by the protocol: **GenLayer adjudicates evidence; Base Sepolia holds, locks, refunds, and distributes USDC.** The backend is an authenticated indexer/relay, never a custody layer. The frontend makes separate Base and GenLayer signatures explicit and treats a transaction as complete only after authoritative receipt/state confirmation.

## Current production contracts

| Layer | Address | Deployment transaction |
| --- | --- | --- |
| GenLayer StudioNet v0.8 adjudicator | [`0x92BfA493f7842EA21ED6134C30f8B8fEEd34b188`](https://explorer-studio.genlayer.com/address/0x92BfA493f7842EA21ED6134C30f8B8fEEd34b188) | [`0xb29caf533a05293cc182245b7665bebbc9b0a4cd41e310afbde9ea5a61451483`](https://explorer-studio.genlayer.com/transactions/0xb29caf533a05293cc182245b7665bebbc9b0a4cd41e310afbde9ea5a61451483) |
| Base Sepolia v0.5 escrow | [`0x3648226dfaBFE79A1Cf0B708880176904b7b1b6c`](https://sepolia.basescan.org/address/0x3648226dfaBFE79A1Cf0B708880176904b7b1b6c) | [`0xd4e697a31bd63eed8d366f785148479864cb6284aa2c77796279aab1390bdc80`](https://sepolia.basescan.org/tx/0xd4e697a31bd63eed8d366f785148479864cb6284aa2c77796279aab1390bdc80) |
| Base Sepolia USDC | [`0x036CbD53842c5426634e7929541eC2318f3dCF7e`](https://sepolia.basescan.org/address/0x036CbD53842c5426634e7929541eC2318f3dCF7e) | Circle test token |

The v0.8 deployment finalized with majority validator agreement. Fly (`uptime-arbiter-usdc-api`) and Vercel production both use the v0.8 address. `/healthz` was checked after deployment and reported `database: true` and `redis: true`.

## Reviewer findings closed

| Finding | Remediation |
| --- | --- |
| Validators trusted a leader return shape | Validator code independently fetches every source and compares substantive report data; `gl.vm.Return` alone never passes. |
| Payable minute tolerance could change money | Leader/validator payable minutes must match exactly. |
| Evidence was weakly attributable | Every decision-critical incident needs a quotation found in the fetched source; report preserves URL, fingerprint, service, timestamps, exclusion and quote. |
| Overlaps could inflate downtime | Intervals are unioned before minute rounding. |
| GitHub Status timestamps were model-dependent | v0.8 parses the complete public Statuspage JSON before limiting only the model prompt; its validator-portable RFC3339 parser derives GitHub Actions incident title/component/timestamps. |
| Base ID could be globally squatted | Reservation is provider-scoped. Backend authenticates the Base provider, parties, terms hash, deposits and deadlines before indexing/relaying; invalid records are skipped without stalling the cursor. |
| Relayer could repeat after veto | `Disputed` is append-only Base status; veto marks the claim disputed and future proposals for it fail. Funds remain recoverable after the settlement deadline. |
| Claims could be future or too fresh | GenLayer enforces completed observation windows, publication lag, service period and filing deadline. |
| Settlement could bypass a challenge | Evaluation is provisional; one counterparty challenge is bounded and finalization waits for the challenge deadline. |
| Expiry could erase an unresolved claim | Base preserves timely open claims through settlement deadline, then refunds original deposits through a bounded recovery path. |
| UI could call a finalized GenLayer error success | The client now requires `FINISHED_WITH_RETURN`; finalized execution errors are surfaced as errors, not timeouts. |
| DB/receipt state could lie | The relay checks Base receipt status and Base state before marking settlement executed. The database is a non-authoritative mirror. |

## Live v0.8 positive challenged-breach trace

The previous contract mirror was cleared before indexing this deployment: 0 SLAs, 0 claims, 0 challenges, with offsets reset to zero. No user sessions or authentication records were deleted.

A real, small USDC agreement is used to validate the new contract rather than seeded UI data. The earlier v0.6/v0.7 archive tests are retained as diagnostics: v0.6 exposed the validator date-parser incompatibility and v0.7 exposed JSON truncation before parsing. Neither result moved funds. v0.8 fixes both by using a contract-local RFC3339 parser and parsing complete structured archive JSON before applying the prompt cap.

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

The claim covers the completed 12 October 2026 GitHub Actions incident window. Three validators agreed on 474 breach minutes and the contract capped the calculated penalty at **0.100000 USDC** (`payout_usdc=100000`, `payout_bps=10000`). The provider then exercised its one allowed challenge with a fresh official Statuspage representation. Re-resolution independently produced the same payable outcome and digest. The ruling is finalized and the backend independently authenticated the Base agreement before submitting the proposal. At publication, Base is deliberately in its ten-minute veto timelock (`TIMELOCK`): this document does not claim a USDC transfer until an execution receipt and post-state readback exist.

## Verification evidence

Executed locally after the v0.8 change:

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
