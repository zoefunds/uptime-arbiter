# Uptime Arbiter

Uptime Arbiter is a two-chain SLA protocol. GenLayer StudioNet adjudicates public uptime evidence; Base Sepolia is the sole USDC custody and settlement layer. Neither an LLM output, an API row, nor a relayer instruction can transfer escrowed funds directly.

## Production deployment — 15 October 2026

| Component | Live value |
| --- | --- |
| Web app | [uptime-arbiter.vercel.app](https://uptime-arbiter.vercel.app) |
| API health | [uptime-arbiter-usdc-api.fly.dev/healthz](https://uptime-arbiter-usdc-api.fly.dev/healthz) |
| GenLayer v0.10 adjudicator | [`0x700D935A78562Dd5FBdfA603bbb5E00C9f521D81`](https://explorer-studio.genlayer.com/address/0x700D935A78562Dd5FBdfA603bbb5E00C9f521D81) |
| GenLayer deployment | [`0xa75f…900b`](https://explorer-studio.genlayer.com/transactions/0xa75f27d8301db569c2219b50c94d888b99eef335ff32a710c48302a98400900b) |
| Base Sepolia v0.8 escrow | [`0x9d8A7e19336725E261d2e11aB4171F1748aB0d6d`](https://sepolia.basescan.org/address/0x9d8A7e19336725E261d2e11aB4171F1748aB0d6d) |
| Base deployment | [`0x7b67…4eb2`](https://sepolia.basescan.org/tx/0x7b67ccfce0b7606d523a3ecf1e5d30350554a623bbacd188543c2f4c836b4eb2) |
| Base Sepolia USDC | [`0x036CbD53842c5426634e7929541eC2318f3dCF7e`](https://sepolia.basescan.org/address/0x036CbD53842c5426634e7929541eC2318f3dCF7e) |
| Public deployment manifest | [`/api/deployment`](https://uptime-arbiter.vercel.app/api/deployment) |

The API health endpoint was checked after deployment and reports healthy Postgres and Redis. The contract mirror was inspected after the address switch and contained zero SLAs, claims, and challenges with cursor `0/0`; no destructive delete was needed and authentication/session data was untouched.

On 15 October 2026, both contracts were redeployed from the tested v0.10/v0.8
sources. The GenLayer deployment finalized with validator consensus. The Base
deployment separates owner, relayer, dispute resolver, and ruling verifier into
four distinct addresses and rejects any future role rotation that collapses
that separation.

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

## Current-version funded evidence

The canonical v0.10/v0.8 pair now has a funded 0.120000-USDC cross-chain
agreement visible as `SLA-1` in the production registry. Its completed-window
claim reached finalized GenLayer consensus. A deliberately unsupported relay
allocation was then [proposed](https://sepolia.basescan.org/tx/0x334a9dadb2bf5832e5e13ff3c1207caa838b1590464d5c03d6cc9e23da8ccec9)
and [vetoed by the customer](https://sepolia.basescan.org/tx/0x621ddc551b535a3b83df9afe16740515894401dbfc116457dae241ffb7443ad5).
No USDC moved. The verifier rejection is intentionally unavailable until the
contract's real 24-hour review delay ends on 16 October 2026 at 21:05:34 WAT;
the pending step and every preceding receipt are documented in
[milestone.md](milestone.md).

## Security and lifecycle

1. A provider creates and funds a Base agreement; the customer explicitly accepts and funds its bond, including when the bond is zero.
2. The provider registers the matching Base terms commitment and funding receipt on GenLayer. The backend independently reads the Base agreement before indexing or relaying it.
3. The customer submits a completed observation window after the configured publication lag. Base locks the same `keccak256(claimId)` before settlement can occur.
4. Leader and validators each fetch every pinned source and derive structured reports. They must agree exactly on payable minutes, source relevance, service identity, maintenance treatment, verifiable quotations, and incident periods.
5. A provisional result has one bounded counterparty challenge. Resolution re-runs all evidence; finalization is impossible until the challenge window closes.
6. The backend derives a Base payout from authenticated terms and a finalized ruling. It proposes a ten-minute-vetoable settlement, verifies successful receipts, and reads Base state before reporting settlement.

Base separates service coverage, claim filing, and settlement recovery deadlines. A timely claim blocks ordinary expiry. A veto marks the claim `Disputed` and prevents relayer reproposal. A separately keyed verifier may reject the proposal or attest a corrected distribution derived from the finalized GenLayer ruling; the resolver can apply only that attestation. If the resolver is unavailable, anyone may apply it after the grace period. Refund after prolonged abandonment requires both parties' consent, so a liable provider cannot erase a valid award alone.

## Evidence consensus

Every validator executes `_collect_evaluation()` itself; it does not merely accept a leader-shaped value. Decision-critical incidents require a quote that appears in the fetched source body. Included intervals are unioned before rounding, so overlapping parent/component records cannot double-count USDC.

For GitHub Actions, v0.10 accepts only the canonical official HTTPS incident archive, parses complete structured JSON before applying the model-prompt cap, and derives downtime from authoritative incident-update transitions—not coarse incident created/resolved envelopes. Maintenance exclusions are recognized from their substantive meaning (maintenance + exclusion intent + explicit advance-notice rule), without requiring one magic phrase. Incomplete or ambiguous transitions are conservatively non-payable and delegated to the semantic evidence path rather than guessed.

## Cross-chain binding and relayer limits

The Base `termsHash` commits chain, escrow address, participants, deposits, all deadlines, pricing, service, evidence URLs, and exclusions. GenLayer scopes its reservation by `Base agreement ID + registering provider`, so a stranger cannot globally squat a Base ID. The backend rejects unauthenticated/mismatched records and advances its cursor past them, preventing invalid registrations from blocking legitimate indexing.

The relayer cannot decide the final economics of a disputed proposal. Base requires the exact open claim, a nonzero ruling hash, and a distribution equal to held USDC. After veto, a distinct ruling verifier must authenticate the claim digest and corrected allocation; a distinct resolver can apply only that verified record. The verifier can instead reject a fabricated proposal and reopen recovery. A permissionless delayed fallback prevents resolver unavailability from locking a verified award, while mutual-consent-only abandonment prevents unilateral escape.

The verifier remains an explicit trusted operational authority rather than a
cryptographic StudioNet light client. Its key must be held separately from the
owner, relayer, and resolver, and every attestation must be reconciled against
the finalized GenLayer claim and retained in an auditable transaction record.
If both verifier and resolver are unavailable, the contract does not grant
either party a unilateral refund: after 30 days, abandonment still requires
both provider and customer consent. This protects an award from unilateral
erasure but cannot guarantee recovery when both authorities and one party are
permanently unavailable.

## Verification

```bash
pytest -q tests/direct/test_uptime_arbiter.py  # 14 passed
forge test -vvv                                # 13 passed
cd backend && npm run build
cd frontend && ./node_modules/.bin/tsc --noEmit && npm run lint
```

The Direct Mode tests cover future/publication-lag rejection, one-per-provider Base binding, attempted Base-ID squatting, fabricated payout minutes, source/service/exclusion/quote disagreement, overlapping intervals, bounded challenge finalization, and deterministic Statuspage extraction. Foundry covers USDC distributions, zero-bond acceptance, claim substitution, expiry recovery, and durable veto/dispute handling.

See [milestone.md](milestone.md) for the complete deployment, live transaction,
migration, and reviewer-remediation record.
