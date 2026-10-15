# Uptime Arbiter

Uptime Arbiter is a two-chain SLA protocol: GenLayer independently adjudicates public evidence, while Base Sepolia exclusively holds and distributes official USDC. No database row, LLM response, or relayer instruction can directly move customer funds.

## Live deployment

Production state was re-verified on **2026-10-15 at 07:27 UTC**. The API health check reported both Postgres and Redis healthy, the public registry returned exactly `SLA-1` through `SLA-3`, and Base Sepolia agreement reads matched the lifecycle states documented below.

| Component | Production value |
| --- | --- |
| Web application | [uptime-arbiter.vercel.app](https://uptime-arbiter.vercel.app) |
| API health | [uptime-arbiter-usdc-api.fly.dev/healthz](https://uptime-arbiter-usdc-api.fly.dev/healthz) |
| GenLayer StudioNet adjudicator | [`0x3C81652798479Af674294155e5bf05C5F42D46f7`](https://explorer-studio.genlayer.com/address/0x3C81652798479Af674294155e5bf05C5F42D46f7) |
| GenLayer deployment transaction | [`0xab1e9154e40b3708ddf464f8b7df78c0216dcd769ac9bc8b08280f0d6b617d21`](https://explorer-studio.genlayer.com/transactions/0xab1e9154e40b3708ddf464f8b7df78c0216dcd769ac9bc8b08280f0d6b617d21) |
| Base Sepolia escrow | [`0x72020561a1fF7c95DD13E6Bfa9D3a5fb387072E3`](https://sepolia.basescan.org/address/0x72020561a1fF7c95DD13E6Bfa9D3a5fb387072E3) |
| Base deployment transaction | [`0xfa0ba68569187030f36e5837517c0ea86a19495f577ee5b769470fa0dd80ea1`](https://sepolia.basescan.org/tx/0xfa0ba68569187030f36e5837517c0ea86a19495f577ee5b769470fa0dd80ea1) |
| Official Base Sepolia USDC | [`0x036CbD53842c5426634e7929541eC2318f3dCF7e`](https://sepolia.basescan.org/address/0x036CbD53842c5426634e7929541eC2318f3dCF7e) |

## Security model

### Independent GenLayer evidence consensus

`contracts/UptimeArbiter.py` v0.4 does not ask validators to approve a leader-shaped return value. The leader and each validator independently fetch every pinned source, treat source bodies as untrusted data, and derive a structured report containing source URL and SHA-256 fingerprint, source relevance, covered-service identity, incident timestamps, short attribution/quotation, exclusion treatment, and breach minutes. Validator equivalence checks independently calculated breach minutes, service relevance, exclusion decisions, and incident periods with narrow timestamp/minute tolerances. A fabricated number, unrelated incident, incompatible maintenance exclusion, or materially different incident period is rejected.

### Unique Base/GenLayer binding

Base commits provider, customer, escrow, bond, four lifecycle deadlines, financial terms, service identity, evidence sources, and exclusions in a `bytes32 termsHash`. GenLayer stores the same canonical hash and permits one adjudication record per Base agreement ID. The backend reads `BaseUsdcEscrow.agreements(id)` and refuses to index or relay when provider, customer, amounts, deadlines, or terms commitment differ. The Base claim lock also binds the agreement to `keccak256(claimId)` so a relayer cannot substitute another ruling.

### Bounded claims and challenges

Claims must be filed by the recorded customer, lie inside the service period, have a completed observation window, satisfy the configured publication lag, and arrive before the claim deadline. Evaluation produces a provisional outcome. The counterparty has one bounded challenge opportunity with additional public sources and a required rationale; challenged evidence is independently re-evaluated. A claim becomes settlement-eligible only after `finalize_claim` runs after the challenge deadline.

### Relayer containment and recovery

The Base relayer is a limited operational trust role, not a unilateral payout authority. It can propose only for the exact open claim and must provide a nonzero finalized evidence digest; the distribution must equal all held USDC and the backend derives it from the authenticated Base terms plus finalized GenLayer penalty. Settlement then waits ten minutes. Either party can veto during that delay. Execution rechecks the committed claim and consumes it exactly once. If relay service fails or a claim remains unresolved, funds stay locked only until a separate bounded settlement deadline and can then be recovered. Without a claim, recovery begins after the claim deadline. The service coverage period is therefore distinct from claim and settlement deadlines.

## End-to-end lifecycle

1. The provider creates a Base agreement, approves the exact six-decimal USDC amount, and funds escrow.
2. The frontend decodes the agreement ID from the successful Base receipt and verifies the complete agreement state.
3. The provider registers the matching terms hash, agreement ID, parties, deadlines, evidence, and Base funding receipt on GenLayer; the app waits for `FINALIZED`, not merely `ACCEPTED`.
4. The customer explicitly accepts every agreement (including a zero-bond agreement), funds any bond on Base, and records that successful receipt on GenLayer.
5. A completed claim is finalized on GenLayer and the same claim ID is opened on Base before expiry.
6. Validators independently retrieve and compare public evidence. A provisional ruling remains challengeable for the committed window.
7. After finalization, the backend authenticates the entire cross-chain binding, proposes a delayed Base distribution, checks the mined receipt status, and later executes it. Reverted receipts remain recoverable and are never recorded as paid.

Interrupted frontend sequences are resumable. An already-created GenLayer claim whose Base lock did not complete exposes “Resume Base claim lock”; users are not told to resubmit the claim or duplicate a payment.

## Backend and UI consistency

Postgres is only a denormalized index. The indexer reconciles every SLA against Base and uses Base’s lifecycle as authoritative: proposed, active, settlement-pending, settled/expired, or cancelled. GenLayer transaction helpers wait for `FINALIZED` and inspect execution results; Base helpers require a successful receipt and then read authoritative contract state. Registry, SLA, claims, Base agreement, vault, and statistics queries poll every three seconds, refetch on focus/reconnect, and are invalidated immediately after writes.

The production database was cleared during the contract migration without deleting authentication/session data. The visible registry now contains only records from the addresses above. Executed verification scenarios appear as ordinary SLA Registry records rather than synthetic cards or a separate verification page.

The current public registry has three concluded records. `SLA-1` / Base agreement 5 completed the full claim, independent evidence evaluation, challenge-window finalization, delayed settlement, and USDC distribution path. `SLA-2` / agreement 6 and `SLA-3` / agreement 7 completed the bounded expiry-recovery path and hold zero deposits. Base agreements 3 and 4 are cancelled. Agreements 1 and 2 are earlier funded, unclaimed interrupted runs that are intentionally excluded from the GenLayer registry; they become recoverable after their claim deadlines at 2026-10-15 07:44:18 UTC and 07:45:27 UTC respectively.

## Verification suites

```bash
pytest -q tests/direct/test_uptime_arbiter.py  # 8 GenLayer Direct Mode tests
forge test -vvv                              # 7 Base escrow tests
cd backend && npm run build
cd ../frontend && ./node_modules/.bin/tsc --noEmit
```

The Direct Mode suite covers unique Base binding, future/unpublished-window rejection, challenge/finalization, fabricated breach values, service mismatch, exclusion disagreement, incident-period disagreement, and bounded timestamp variance. Foundry covers exact partial/no-breach distributions, expiry refunds, mandatory zero-bond acceptance, unresolved-claim preservation and recovery, party veto, and claim-substitution rejection.

See [milestone.md](milestone.md) for the live transaction and balance-evidence record.
