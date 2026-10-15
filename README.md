# Uptime Arbiter

Uptime Arbiter is a two-chain SLA protocol. GenLayer StudioNet adjudicates public uptime evidence; Base Sepolia is the sole USDC custody and settlement layer. Neither an LLM output, an API row, nor a relayer instruction can transfer escrowed funds directly.

## Production deployment — 15 October 2026

| Component | Live value |
| --- | --- |
| Web app | [uptime-arbiter.vercel.app](https://uptime-arbiter.vercel.app) |
| API health | [uptime-arbiter-usdc-api.fly.dev/healthz](https://uptime-arbiter-usdc-api.fly.dev/healthz) |
| GenLayer v0.8 adjudicator | [`0x92BfA493f7842EA21ED6134C30f8B8fEEd34b188`](https://explorer-studio.genlayer.com/address/0x92BfA493f7842EA21ED6134C30f8B8fEEd34b188) |
| GenLayer deployment | [`0xb29c…1483`](https://explorer-studio.genlayer.com/transactions/0xb29caf533a05293cc182245b7665bebbc9b0a4cd41e310afbde9ea5a61451483) |
| Base Sepolia v0.5 escrow | [`0x3648226dfaBFE79A1Cf0B708880176904b7b1b6c`](https://sepolia.basescan.org/address/0x3648226dfaBFE79A1Cf0B708880176904b7b1b6c) |
| Base deployment | [`0xd4e6…dc80`](https://sepolia.basescan.org/tx/0xd4e697a31bd63eed8d366f785148479864cb6284aa2c77796279aab1390bdc80) |
| Base Sepolia USDC | [`0x036CbD53842c5426634e7929541eC2318f3dCF7e`](https://sepolia.basescan.org/address/0x036CbD53842c5426634e7929541eC2318f3dCF7e) |

The API health endpoint was checked after deployment and reports healthy Postgres and Redis. Contract-index tables were deliberately cleared and their cursor reset before the new adjudicator was indexed; authentication/session data was not touched.

## Security and lifecycle

1. A provider creates and funds a Base agreement; the customer explicitly accepts and funds its bond, including when the bond is zero.
2. The provider registers the matching Base terms commitment and funding receipt on GenLayer. The backend independently reads the Base agreement before indexing or relaying it.
3. The customer submits a completed observation window after the configured publication lag. Base locks the same `keccak256(claimId)` before settlement can occur.
4. Leader and validators each fetch every pinned source and derive structured reports. They must agree exactly on payable minutes, source relevance, service identity, maintenance treatment, verifiable quotations, and incident periods.
5. A provisional result has one bounded counterparty challenge. Resolution re-runs all evidence; finalization is impossible until the challenge window closes.
6. The backend derives a Base payout from authenticated terms and a finalized ruling. It proposes a ten-minute-vetoable settlement, verifies successful receipts, and reads Base state before reporting settlement.

Base separates service coverage, claim filing, and settlement recovery deadlines. A timely claim blocks ordinary expiry. A veto permanently marks that claim `Disputed`, prevents relayer reproposal, and preserves the bounded Base recovery path.

## Evidence consensus

Every validator executes `_collect_evaluation()` itself; it does not merely accept a leader-shaped value. Decision-critical incidents require a quote that appears in the fetched source body. Included intervals are unioned before rounding, so overlapping parent/component records cannot double-count USDC.

For GitHub Actions, v0.8 deterministically parses the complete GitHub Status `incidents.json` response before applying the text cap used only for model prompts. Incident title, affected `Actions` component, `created_at`, and `resolved_at` are public source facts; the small RFC3339 parser is validator-portable. This fixes large-archive truncation while preserving bounded untrusted prompt text. Query variants in the live verification are representations of the same official archive, not falsely described as independent publishers.

## Cross-chain binding and relayer limits

The Base `termsHash` commits chain, escrow address, participants, deposits, all deadlines, pricing, service, evidence URLs, and exclusions. GenLayer scopes its reservation by `Base agreement ID + registering provider`, so a stranger cannot globally squat a Base ID. The backend rejects unauthenticated/mismatched records and advances its cursor past them, preventing invalid registrations from blocking legitimate indexing.

The relayer cannot choose arbitrary economics: Base requires the exact open claim, a nonzero ruling hash, unconsumed/undisputed claim ID, and a distribution equal to held USDC. The backend verifies Base/GenLayer parties, terms hash, deposits, and deadlines; it then derives the payout. This remains a deliberately documented operational trust boundary—not a light-client proof—but it is delayed, visible, vetoable, receipt-checked, and bounded by recovery.

## Verification

```bash
pytest -q tests/direct/test_uptime_arbiter.py  # 12 passed
forge test -vvv                                # 7 passed
cd backend && npm run build
cd frontend && ./node_modules/.bin/tsc --noEmit && npm run lint
```

The Direct Mode tests cover future/publication-lag rejection, one-per-provider Base binding, attempted Base-ID squatting, fabricated payout minutes, source/service/exclusion/quote disagreement, overlapping intervals, bounded challenge finalization, and deterministic Statuspage extraction. Foundry covers USDC distributions, zero-bond acceptance, claim substitution, expiry recovery, and durable veto/dispute handling.

See [milestone.md](milestone.md) for deployment, live transaction, and migration evidence.
