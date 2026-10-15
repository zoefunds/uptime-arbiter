# Uptime Arbiter

Uptime Arbiter is a two-chain SLA protocol. GenLayer StudioNet adjudicates public uptime evidence; Base Sepolia is the sole USDC custody and settlement layer. Neither an LLM output, an API row, nor a relayer instruction can transfer escrowed funds directly.

## Production deployment — 15 October 2026

| Component | Live value |
| --- | --- |
| Web app | [uptime-arbiter.vercel.app](https://uptime-arbiter.vercel.app) |
| API health | [uptime-arbiter-usdc-api.fly.dev/healthz](https://uptime-arbiter-usdc-api.fly.dev/healthz) |
| GenLayer v0.9 adjudicator (current redeployment) | [`0xF6939F08B86162aA26849572f95d6D0147E357B4`](https://explorer-studio.genlayer.com/address/0xF6939F08B86162aA26849572f95d6D0147E357B4) |
| GenLayer deployment | [`0x450c…8e04`](https://explorer-studio.genlayer.com/transactions/0x450c4736f0ea39f5c5d9dc63809c8ed9d5db5a687036a4f13f7014ef2b678e04) |
| Base Sepolia v0.7 escrow | [`0x8025E0Edd8BF6D27322A07699EB237F7248Dea6A`](https://sepolia.basescan.org/address/0x8025E0Edd8BF6D27322A07699EB237F7248Dea6A) |
| Base deployment | [`0x88c9…0520`](https://sepolia.basescan.org/tx/0x88c9a70ed2653e9912d7879ef42ef56eacd2825646c642e56416032741310520) |
| Base Sepolia USDC | [`0x036CbD53842c5426634e7929541eC2318f3dCF7e`](https://sepolia.basescan.org/address/0x036CbD53842c5426634e7929541eC2318f3dCF7e) |

The API health endpoint was checked after deployment and reports healthy Postgres and Redis. Contract-index tables were deliberately cleared and their cursor reset before the new adjudicator was indexed; authentication/session data was not touched.

On 15 October 2026, the GenLayer adjudicator was redeployed from the tested
current `contracts/UptimeArbiter.py` source after the canonical-incident
evidence documentation was corrected. The redeployment transaction finalized
with five agreeing validators. The Base v0.7 escrow is unchanged because no
Solidity source or ABI changed; Vercel and Fly now point at the replacement
GenLayer address above.

## Historical live settlement evidence

The immediately preceding v0.8/v0.5 deployment completed a real
challenged-breach lifecycle, not a seeded interface scenario. `CLM-1` finalized as a 474-minute breach, capped at
`100000` Base-USDC units (0.100000 USDC), after one provider challenge and
re-resolution. The backend authenticated the linked Base agreement, proposed
the delayed settlement, waited through the party-veto window, verified a
successful Base receipt, and reread escrow state before marking it executed.

- [Finalized GenLayer ruling](https://explorer-studio.genlayer.com/transactions/0x612b8254f54ee8148a26a115748690dcb9237c1277dfc77cd65d03c461788020)
- [Base settlement proposal](https://sepolia.basescan.org/tx/0xb10f8e0e4c40e4834ae8196f1914abd44d0982149b995387e813c4984e0ace2d)
- [Receipt-verified Base execution](https://sepolia.basescan.org/tx/0x796ea0a1398772f6b4cd15cf34c7904b522c8a9345b13afc63ba43a8fd54ac8b)

## Security and lifecycle

1. A provider creates and funds a Base agreement; the customer explicitly accepts and funds its bond, including when the bond is zero.
2. The provider registers the matching Base terms commitment and funding receipt on GenLayer. The backend independently reads the Base agreement before indexing or relaying it.
3. The customer submits a completed observation window after the configured publication lag. Base locks the same `keccak256(claimId)` before settlement can occur.
4. Leader and validators each fetch every pinned source and derive structured reports. They must agree exactly on payable minutes, source relevance, service identity, maintenance treatment, verifiable quotations, and incident periods.
5. A provisional result has one bounded counterparty challenge. Resolution re-runs all evidence; finalization is impossible until the challenge window closes.
6. The backend derives a Base payout from authenticated terms and a finalized ruling. It proposes a ten-minute-vetoable settlement, verifies successful receipts, and reads Base state before reporting settlement.

Base separates service coverage, claim filing, and settlement recovery deadlines. A timely claim blocks ordinary expiry. A veto permanently marks that claim `Disputed`, prevents relayer reproposal, and freezes the exact ruling rather than returning deposits. After a 24-hour independent review, the configured resolver may re-authorize only that frozen ruling; this is final for that claim, so a liable party cannot veto repeatedly.

## Evidence consensus

Every validator executes `_collect_evaluation()` itself; it does not merely accept a leader-shaped value. Decision-critical incidents require a quote that appears in the fetched source body. Included intervals are unioned before rounding, so overlapping parent/component records cannot double-count USDC.

For GitHub Actions, v0.9 accepts only the canonical official HTTPS incident archive, parses complete structured JSON before applying the model-prompt cap, and derives downtime from authoritative incident-update transitions—not coarse incident created/resolved envelopes. Announced scheduled maintenance is excluded only when the Statuspage record proves the contractual advance-notice rule; uncertain intervals are non-payable.

## Cross-chain binding and relayer limits

The Base `termsHash` commits chain, escrow address, participants, deposits, all deadlines, pricing, service, evidence URLs, and exclusions. GenLayer scopes its reservation by `Base agreement ID + registering provider`, so a stranger cannot globally squat a Base ID. The backend rejects unauthenticated/mismatched records and advances its cursor past them, preventing invalid registrations from blocking legitimate indexing.

The relayer cannot choose arbitrary economics: Base requires the exact open claim, a nonzero ruling hash, and a distribution equal to held USDC. A party veto freezes that exact ruling; it cannot be reproposed or refunded as original deposits. After an independent review delay, a separately configured resolver can re-authorize only the already-frozen ruling. That reauthorization is final for the frozen claim, preventing an endless veto loop. This is an explicit operational trust boundary rather than a light-client proof.

## Verification

```bash
pytest -q tests/direct/test_uptime_arbiter.py  # 14 passed
forge test -vvv                                # 8 passed
cd backend && npm run build
cd frontend && ./node_modules/.bin/tsc --noEmit && npm run lint
```

The Direct Mode tests cover future/publication-lag rejection, one-per-provider Base binding, attempted Base-ID squatting, fabricated payout minutes, source/service/exclusion/quote disagreement, overlapping intervals, bounded challenge finalization, and deterministic Statuspage extraction. Foundry covers USDC distributions, zero-bond acceptance, claim substitution, expiry recovery, and durable veto/dispute handling.

See [milestone.md](milestone.md) for the complete deployment, live transaction,
migration, and reviewer-remediation record.
