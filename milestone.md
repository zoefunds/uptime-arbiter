# Uptime Arbiter security and enforceability milestone

## Scope and result

This milestone responds directly to the GenLayer review. It replaces the earlier leader-shape validator, caller-trusted cross-chain records, immediate privileged relay, missing challenge period, future-window claims, unsafe expiry, permissionless relay marker, weak receipt handling, and ambiguous zero-bond activation with an independently validated, uniquely bound, challengeable, delayed, vetoable, recoverable protocol.

Production is deployed at [uptime-arbiter.vercel.app](https://uptime-arbiter.vercel.app); the backend health endpoint is [uptime-arbiter-usdc-api.fly.dev/healthz](https://uptime-arbiter-usdc-api.fly.dev/healthz).

This record was last reconciled against the live API and Base Sepolia on **2026-10-15 at 07:27 UTC**. At that time Postgres and Redis were healthy, the registry contained only the three final-contract SLAs below, and all seven Base agreement states matched the on-chain snapshot in the production section.

## Final contracts

| Layer | Address | Deployment transaction |
| --- | --- | --- |
| GenLayer StudioNet adjudicator | [`0x3C81652798479Af674294155e5bf05C5F42D46f7`](https://explorer-studio.genlayer.com/address/0x3C81652798479Af674294155e5bf05C5F42D46f7) | [`0xab1e9154e40b3708ddf464f8b7df78c0216dcd769ac9bc8b08280f0d6b617d21`](https://explorer-studio.genlayer.com/transactions/0xab1e9154e40b3708ddf464f8b7df78c0216dcd769ac9bc8b08280f0d6b617d21) |
| Base Sepolia USDC escrow | [`0x72020561a1fF7c95DD13E6Bfa9D3a5fb387072E3`](https://sepolia.basescan.org/address/0x72020561a1fF7c95DD13E6Bfa9D3a5fb387072E3) | [`0xfa0ba68569187030f36e5837517c0ea86a19495f577ee5b769470fa0dd80ea1`](https://sepolia.basescan.org/tx/0xfa0ba68569187030f36e5837517c0ea86a19495f577ee5b769470fa0dd80ea1) |
| Official Base Sepolia USDC | [`0x036CbD53842c5426634e7929541eC2318f3dCF7e`](https://sepolia.basescan.org/address/0x036CbD53842c5426634e7929541eC2318f3dCF7e) | Circle test token |

The GenLayer deployment finalized with five agreeing validators. The Base escrow is the sole asset custodian; GenLayer contains no token transfer path.

## Review issue remediation

### Genuine validator-side evidence work

`evaluate_claim()` now executes `_collect_evaluation()` independently inside both the leader and validator paths. Each validator retrieves every registered URL itself and derives a structured source report containing:

- exact source URL and SHA-256 body fingerprint;
- whether the source is usable and relevant;
- whether it actually covers the named service;
- incident start/end timestamps and affected-service identity;
- a short factual summary and supporting quotation;
- whether a maintenance exclusion applies and why; and
- independently calculated overlap/breach minutes.

`evaluations_equivalent()` rejects leader output when the source list, relevance, service identity, exclusion treatment, incident count/period, source-derived breach minutes, or final breach calculation diverges outside narrow tolerances. It never accepts a result merely because it is a `gl.vm.Return`.

The live CLM-1 evaluation at [`0xd44a9aa2704ab80fb73f0ea4f3eb051320b5fa583cb4e2b2551f4300dc650d8d`](https://explorer-studio.genlayer.com/transactions/0xd44a9aa2704ab80fb73f0ea4f3eb051320b5fa583cb4e2b2551f4300dc650d8d) independently fetched three GitHub Status endpoints. Its vote set included three validator agreements, one validator disagreement, and one idle validator while still reaching majority consensus. The persisted report contains three distinct source fingerprints and digest `0x84dd2e34428290a3093032267a205b400d3c59a32ecc7e7533cc27468484a660`.

### Authenticated and unique cross-chain binding

The Base `termsHash` commits chain ID, escrow address, provider, customer, provider escrow, customer bond, registration/service/claim/settlement deadlines, uptime and penalty terms, label, covered service, evidence URLs, and exclusion language. GenLayer receives that value as an integer (avoiding CLI coercion) and stores the canonical 32-byte lowercase hex value. `base_agreement_bindings` permits only one SLA per Base ID.

Before indexing or relaying, the backend reads the actual Base agreement and rejects any mismatch in provider, customer, escrow, bond, service end, claim deadline, settlement deadline, or terms commitment. Base separately binds an open escrow to `keccak256(GenLayer claim ID)`; a relayer cannot settle a different claim.

### Relayer authority is delayed, visible, vetoable, and recoverable

`relayAdjudication()` was replaced by two phases. The relayer may call `proposeAdjudication()` only for the exact open claim, with a nonzero evidence digest and a distribution equal to all held USDC. The backend derives customer payout as customer bond plus the GenLayer penalty and provider refund as provider deposit minus penalty. Neither value is accepted from an API caller.

Settlement waits ten minutes. Either recorded party may veto before `executeAfter`; execution rechecks pending state and consumes the claim exactly once. The backend checks every Base receipt’s `status` and reads the final agreement status before marking payment final. A reverted transaction remains recoverable. If no valid execution occurs, either party can use the bounded expiry recovery path.

### Challenge, time, expiry, and zero-bond rules

- A claim window must be inside service coverage, already ended, and older than the committed publication lag.
- Filing must occur before a distinct claim deadline.
- Evaluation is provisional for at least ten minutes. The counterparty can file one reasoned challenge with new sources; `resolve_challenge()` independently re-runs all evidence.
- `finalize_claim()` is impossible while the challenge window is open.
- Base distinguishes service end, claim deadline, and settlement deadline. A timely open claim prevents ordinary expiry; unresolved funds remain protected until the bounded settlement deadline.
- `recoverExpired()` refunds original deposits after the applicable deadline.
- Customer acceptance is mandatory even when the configured bond is zero.
- The old permissionless `mark_relayed()` method no longer exists. Settlement state is reconciled from successful Base transactions.

## Three real cross-chain scenarios

All scenarios used provider `0x7401c129EDfc26E68FE19309fE461eb3Db1058Eb`, customer `0x68196841178537F68036AAc2b8882FCd41c541c0`, 0.100000 provider USDC, and 0.020000 customer USDC. Each was funded on Base and registered/funding-acknowledged on the final GenLayer contract. They appear under the ordinary SLA Registry, not as placeholder verification cards.

### 1. SLA-1 / Base agreement 5 — finalized no-breach settlement

- Base proposal: [`0x609775339465bf9ea2e523cc75f69dd178051a15906de9a15888047a8754b1e2`](https://sepolia.basescan.org/tx/0x609775339465bf9ea2e523cc75f69dd178051a15906de9a15888047a8754b1e2)
- Base provider funding: [`0x1dd8630195fd28ab92ad15ffc835ba7762f26476e9aff0bd3ae6d3dccdeb4ba2`](https://sepolia.basescan.org/tx/0x1dd8630195fd28ab92ad15ffc835ba7762f26476e9aff0bd3ae6d3dccdeb4ba2)
- Base customer funding: [`0x51802c52a95b1f162ccc2fb7c0d7fdb956f66b84db511df8589ceed0e878c089`](https://sepolia.basescan.org/tx/0x51802c52a95b1f162ccc2fb7c0d7fdb956f66b84db511df8589ceed0e878c089)
- GenLayer registration: [`0x50060ad1dfea92b3d9901cca075ee80b6a6c8503fd24ffd6efddf80a56dcfa6f`](https://explorer-studio.genlayer.com/transactions/0x50060ad1dfea92b3d9901cca075ee80b6a6c8503fd24ffd6efddf80a56dcfa6f)
- GenLayer customer funding acknowledgment: [`0xa24a92b6f0b95ef5ca1619584b0f43dc83635a44fd731b89ec3856764727d9c6`](https://explorer-studio.genlayer.com/transactions/0xa24a92b6f0b95ef5ca1619584b0f43dc83635a44fd731b89ec3856764727d9c6)
- GenLayer claim: [`0x654f840fa04674dce4fe5f1c65c37209cceaeed1dde7be13827a8033d1ff4103`](https://explorer-studio.genlayer.com/transactions/0x654f840fa04674dce4fe5f1c65c37209cceaeed1dde7be13827a8033d1ff4103)
- Base claim lock: [`0x3f2c36ae35878302221bef59bebdb7e07d110cf688b873daec01febf0b4c375b`](https://sepolia.basescan.org/tx/0x3f2c36ae35878302221bef59bebdb7e07d110cf688b873daec01febf0b4c375b)
- GenLayer evaluation: [`0xd44a9aa2704ab80fb73f0ea4f3eb051320b5fa583cb4e2b2551f4300dc650d8d`](https://explorer-studio.genlayer.com/transactions/0xd44a9aa2704ab80fb73f0ea4f3eb051320b5fa583cb4e2b2551f4300dc650d8d)
- GenLayer finalization after the full challenge window: [`0x11516d5cf55de978fd3913c65ea0ed36e1536f7b2ba744d4f3dbdf5e748d061e`](https://explorer-studio.genlayer.com/transactions/0x11516d5cf55de978fd3913c65ea0ed36e1536f7b2ba744d4f3dbdf5e748d061e)
- Delayed Base settlement proposal: [`0xadec5cc7cdccdafae6599219aa8faed90092cd14df4b1c4d46c31d27b37cda3e`](https://sepolia.basescan.org/tx/0xadec5cc7cdccdafae6599219aa8faed90092cd14df4b1c4d46c31d27b37cda3e)
- Base execution after the complete veto delay: [`0x003d9ccbea57f24e695bab398595b4f4e899cc6336641d7f4bf5cfc02c7f4fe2`](https://sepolia.basescan.org/tx/0x003d9ccbea57f24e695bab398595b4f4e899cc6336641d7f4bf5cfc02c7f4fe2)

The final ruling is `FINALIZED_NO_BREACH`: breach minutes 0, penalty 0, customer distribution 0.020000 USDC (bond return), and provider refund 0.100000 USDC. The `AdjudicationExecuted` event records those exact values. Combined with the prior two recovery scenarios, balances moved from provider 4.530000/customer 0.500000 USDC before recovery to provider 4.730000/customer 0.540000 after recovery, then to provider 4.830000/customer 0.560000 after settlement. Agreement 5 reads `Settled`, `claimOpen=false`, and `consumedClaims(keccak256("CLM-1"))=true`.

### 2. SLA-2 / Base agreement 6 — bounded expiry recovery

- Base proposal/funding: [`0xe3e4d4140070bef8221fd5fe907818e7b71e80cf212c59ab885621cb0a0b56ee`](https://sepolia.basescan.org/tx/0xe3e4d4140070bef8221fd5fe907818e7b71e80cf212c59ab885621cb0a0b56ee), [`0x7a106cf46e842bf1ebf1788041aa05bd0fef99a89ebb965f85a8b4263d6cae2a`](https://sepolia.basescan.org/tx/0x7a106cf46e842bf1ebf1788041aa05bd0fef99a89ebb965f85a8b4263d6cae2a), [`0xe0a6c18e70ac67bb384b9296aa725cecb087a44e3b6520d54a132557e2267131`](https://sepolia.basescan.org/tx/0xe0a6c18e70ac67bb384b9296aa725cecb087a44e3b6520d54a132557e2267131)
- GenLayer registration/acknowledgment: [`0x58765901f2bb5f03d3f1ffc5ba1e6fe2304e9d43209780e2a40ee1e0448279cc`](https://explorer-studio.genlayer.com/transactions/0x58765901f2bb5f03d3f1ffc5ba1e6fe2304e9d43209780e2a40ee1e0448279cc), [`0x5e5869bffe249f508ae2831f014af6edf561baf6591c90d4b2f34dad0cd158c3`](https://explorer-studio.genlayer.com/transactions/0x5e5869bffe249f508ae2831f014af6edf561baf6591c90d4b2f34dad0cd158c3)
- Base recovery: [`0xdfcdbe3564b3daaad72d3963bbf9a307b7017d75d63dbf3cf35fe58ffb050de2`](https://sepolia.basescan.org/tx/0xdfcdbe3564b3daaad72d3963bbf9a307b7017d75d63dbf3cf35fe58ffb050de2)

### 3. SLA-3 / Base agreement 7 — independent second recovery

- Base proposal/funding: [`0xe8240af43b11330e8fb8611bdae68266e28b4c7204303285f142c9d8cca55efe`](https://sepolia.basescan.org/tx/0xe8240af43b11330e8fb8611bdae68266e28b4c7204303285f142c9d8cca55efe), [`0x0bca65f3d3fbd2a5d7463d8922105e2d9144226f89ea7f6a769c66d4427783e0`](https://sepolia.basescan.org/tx/0x0bca65f3d3fbd2a5d7463d8922105e2d9144226f89ea7f6a769c66d4427783e0), [`0x5c27acc991729261ba80555f34fbf2c07c13a7f02e5db7b28c366f1e5d6a864e`](https://sepolia.basescan.org/tx/0x5c27acc991729261ba80555f34fbf2c07c13a7f02e5db7b28c366f1e5d6a864e)
- GenLayer registration/acknowledgment: [`0x8d45c98ad8ad2b5c9363b624be7bf44872fc4db67170950ec800625cc97e39bc`](https://explorer-studio.genlayer.com/transactions/0x8d45c98ad8ad2b5c9363b624be7bf44872fc4db67170950ec800625cc97e39bc), [`0xa1d178a5ff42dc76367cf62dbc57124b860fa8391839cab278e8c07386e3c384`](https://explorer-studio.genlayer.com/transactions/0xa1d178a5ff42dc76367cf62dbc57124b860fa8391839cab278e8c07386e3c384)
- Base recovery: [`0x38e2669412df17b53abb7ce5656736dfd040df854b9b8c2d1b41f0e52f66cff6`](https://sepolia.basescan.org/tx/0x38e2669412df17b53abb7ce5656736dfd040df854b9b8c2d1b41f0e52f66cff6)

Across scenarios 2 and 3, the two recovery receipts changed the provider balance from 4.530000 to 4.730000 USDC and customer balance from 0.500000 to 0.540000 USDC—exactly two 0.100000 escrow refunds and two 0.020000 bond refunds. Contract-held deposits read back as zero and both agreements read `Expired`.

## Automated adversarial verification

`pytest -q tests/direct/test_uptime_arbiter.py` passes 8/8. It proves unique Base binding; future and unpublished-window rejection; challenge and finalization; rejection of fabricated breach minutes; wrong-service relevance; maintenance-exclusion disagreement; different incident periods; and acceptance only within documented tolerances.

`forge test -vvv` passes 7/7. It proves exact partial and no-breach distributions, post-claim-deadline refund, mandatory zero-bond acceptance, unresolved-claim preservation plus bounded recovery, party veto of a compromised relay proposal, and rejection of a substituted claim ID.

Backend TypeScript build and frontend TypeScript validation pass. Production Vercel compilation also completes successfully.

## Production integration and data migration

- Fly app: `uptime-arbiter-usdc-api`; API and indexer run from the same deployed image.
- Vercel deployment alias: [uptime-arbiter.vercel.app](https://uptime-arbiter.vercel.app).
- Contract-derived Postgres tables and index cursor were cleared for the migration; auth/session data was retained.
- The backend and frontend both point to the final addresses above.
- The indexer rejects cross-chain binding mismatches and reads Base lifecycle/deposits authoritatively.
- Every live view polls every three seconds and refetches after focus, reconnect, and writes.
- The UI shows structured evidence, challenge/finalization state, Base settlement stages, explorer links, and an interrupted-claim recovery action.

### Complete Base agreement inventory

The final Base contract has seven agreement IDs. This table distinguishes production demonstration records from interrupted setup attempts instead of silently presenting the latter as SLAs.

| Base ID | Current on-chain state | Deposits held | Registry relationship |
| --- | --- | --- | --- |
| 1 | `Active`, no open claim | 0.100000 provider + 0.020000 customer USDC | Interrupted pre-registration run; not a GenLayer SLA. Recovery becomes available after the 2026-10-15 07:44:18 UTC claim deadline. |
| 2 | `Active`, no open claim | 0.100000 provider + 0.020000 customer USDC | Interrupted pre-registration run; not a GenLayer SLA. Recovery becomes available after the 2026-10-15 07:45:27 UTC claim deadline. |
| 3 | `Cancelled` | 0 | Unfunded interrupted proposal; explicitly cancelled. |
| 4 | `Cancelled` | 0 | Unfunded interrupted proposal; explicitly cancelled. |
| 5 | `Settled` | 0 distributable balance; original deposit fields remain immutable audit data | `SLA-1`, finalized no-breach adjudication and executed distribution. |
| 6 | `Expired` | 0 | `SLA-2`, both deposits recovered through bounded expiry. |
| 7 | `Expired` | 0 | `SLA-3`, both deposits recovered through bounded expiry. |

Agreement 5 has no open claim and `consumedClaims(keccak256("CLM-1"))` is true. Its execution transaction distributed 0.020000 USDC to the customer and 0.100000 USDC to the provider. Agreements 6 and 7 each returned the same original deposits through `recoverExpired()`. No synthetic database row or frontend-only scenario is counted in this inventory.

## Source comparison

[Compare the previous accepted milestone (`79f8511`) with the current production branch](https://github.com/zoefunds/uptime-arbiter/compare/79f8511...main). Both references belong to `zoefunds/uptime-arbiter`; using `main` keeps the comparison current after documentation-only follow-up commits.
