# Uptime Arbiter v0.10/v0.8 security and enforceability milestone

## Delivered architecture

This milestone completes the split required by the protocol: **GenLayer adjudicates evidence; Base Sepolia holds, locks, refunds, and distributes USDC.** The backend is an authenticated indexer/relay, never a custody layer. The frontend makes separate Base and GenLayer signatures explicit and treats a transaction as complete only after authoritative receipt/state confirmation.

## Current production contracts

| Layer | Address | Deployment transaction |
| --- | --- | --- |
| GenLayer StudioNet v0.10 adjudicator | [`0x700D935A78562Dd5FBdfA603bbb5E00C9f521D81`](https://explorer-studio.genlayer.com/address/0x700D935A78562Dd5FBdfA603bbb5E00C9f521D81) | [`0xa75f27d8301db569c2219b50c94d888b99eef335ff32a710c48302a98400900b`](https://explorer-studio.genlayer.com/transactions/0xa75f27d8301db569c2219b50c94d888b99eef335ff32a710c48302a98400900b) |
| Base Sepolia v0.8 escrow | [`0x9d8A7e19336725E261d2e11aB4171F1748aB0d6d`](https://sepolia.basescan.org/address/0x9d8A7e19336725E261d2e11aB4171F1748aB0d6d) | [`0x7b67ccfce0b7606d523a3ecf1e5d30350554a623bbacd188543c2f4c836b4eb2`](https://sepolia.basescan.org/tx/0x7b67ccfce0b7606d523a3ecf1e5d30350554a623bbacd188543c2f4c836b4eb2) |
| Base Sepolia USDC | [`0x036CbD53842c5426634e7929541eC2318f3dCF7e`](https://sepolia.basescan.org/address/0x036CbD53842c5426634e7929541eC2318f3dCF7e) | Circle test token |

The v0.10 GenLayer deployment finalized with majority validator agreement. The v0.8 Base deployment has nonempty runtime bytecode and its on-chain owner, relayer, resolver, and verifier reads match the four distinct operational addresses documented below. Fly and Vercel were redeployed against this pair. The live `/healthz` response returned `database: true` and `redis: true`; the production contract mirror was verified as zero SLA, zero claim, zero challenge, cursor `0/0`, so no destructive database deletion was necessary.

### 15 October 2026 authenticated-dispute redeployment

The adjudicator was redeployed from the tested v0.10 source at
[`0x700D…1D81`](https://explorer-studio.genlayer.com/address/0x700D935A78562Dd5FBdfA603bbb5E00C9f521D81).
The escrow was redeployed from v0.8 at
[`0x9d8A…0d6d`](https://sepolia.basescan.org/address/0x9d8A7e19336725E261d2e11aB4171F1748aB0d6d).
Before deployment, 14 Direct Mode tests and 13 Foundry tests passed, as did the
backend TypeScript build and frontend typecheck/lint.

The Base operational roles are deliberately distinct: owner
`0x7401c129EDfc26E68FE19309fE461eb3Db1058Eb`, relayer
`0xEeE61293E25b5D4E9034DCEEB57AC89ff931B642`, resolver
`0x187F4B4128244De438db8a732c871Ff88779D9F9`, and ruling verifier
`0x994541A7CD9244FBD997Ba9774DbcEef226c5998`. Constructor and rotation checks
prevent any two roles from being the same address.

## Reviewer findings closed

| Finding | Remediation |
| --- | --- |
| Validators trusted a leader return shape | Validator code independently fetches every source and compares substantive report data; `gl.vm.Return` alone never passes. |
| Payable minute tolerance could change money | Leader/validator payable minutes must match exactly. |
| Evidence was weakly attributable | Every decision-critical incident needs a quotation found in the fetched source; report preserves URL, fingerprint, service, timestamps, exclusion and quote. |
| Overlaps could inflate downtime | Intervals are unioned before minute rounding. |
| GitHub Status timestamps were over-broad | v0.10 accepts only the canonical official archive host/path, uses update transitions for actual impairment intervals, and excludes qualifying announced maintenance deterministically. |
| Base ID could be globally squatted | Reservation is provider-scoped. Backend authenticates the Base provider, parties, terms hash, deposits and deadlines before indexing/relaying; invalid records are skipped without stalling the cursor. |
| A veto could lock funds or preserve a malicious relay allocation | Veto blocks the relayer. A separate verifier can reject the proposal or attest a corrected claim digest/allocation; the resolver can apply only that attestation. Anyone can apply an attested ruling after the resolver grace period. Abandonment refund requires both parties, so neither can nullify a valid award alone. |
| Operational roles could collapse into one key | Owner, relayer, resolver, and verifier must be pairwise distinct in the constructor and every role setter. |
| Maintenance depended on one literal phrase | Deterministic exclusion recognizes maintenance, exclusion intent, and an explicit 24-hour/one-day notice rule; the test places maintenance inside the observation window without using the phrase “scheduled maintenance.” |
| Incomplete incident transitions could be guessed | Missing or ambiguous impairment boundaries are conservatively non-payable; noncanonical evidence remains subject to independent semantic evaluation rather than fabricated durations. |
| Claims could be future or too fresh | GenLayer enforces completed observation windows, publication lag, service period and filing deadline. |
| Settlement could bypass a challenge | Evaluation is provisional; one counterparty challenge is bounded and finalization waits for the challenge deadline. |
| Expiry could erase an unresolved claim | Base preserves timely open claims through settlement deadline, then refunds original deposits through a bounded recovery path. |
| UI could call a finalized GenLayer error success | The client now requires `FINISHED_WITH_RETURN`; finalized execution errors are surfaced as errors, not timeouts. |
| DB/receipt state could lie | The relay checks Base receipt status and Base state before marking settlement executed. The database is a non-authoritative mirror. |

## Current v0.10/v0.8 funded cross-chain evidence

Agreement `2` is a fresh, real 0.120000-USDC lifecycle on the canonical
contracts, not seeded UI data. The provider deposited 0.100000 USDC and the
customer accepted with a 0.020000-USDC bond. GenLayer `SLA-1` commits the exact
Base agreement ID and `termsHash`
`0xbf4353a137bc27f766e66d30cdf340a49b4c7a90cc7904c4b5475497e48bb18d`.
The production indexer mirrored it and the public registry rendered it as an
active SLA with both current explorer-linked contract addresses.

| Step | Public transaction |
| --- | --- |
| Base agreement 2 proposal | [`0xfcfe4b22b920a7ca954065380852ebc0f01a47ae046c06c085221ae4ea5a5e00`](https://sepolia.basescan.org/tx/0xfcfe4b22b920a7ca954065380852ebc0f01a47ae046c06c085221ae4ea5a5e00) |
| Provider USDC approval | [`0x85f5b95d0cd93025a819b30932b32ec63d267fdb5b0e36ad13486109b113094e`](https://sepolia.basescan.org/tx/0x85f5b95d0cd93025a819b30932b32ec63d267fdb5b0e36ad13486109b113094e) |
| Provider 0.100000-USDC funding | [`0x12d7a640f5dd4811ab7454649afb774bde4f391e34a84e9d705845d9f4dc6a86`](https://sepolia.basescan.org/tx/0x12d7a640f5dd4811ab7454649afb774bde4f391e34a84e9d705845d9f4dc6a86) |
| Customer USDC approval | [`0xf03969ca95d86d34c89754e521b9437d0e9b76ce8fe1992ab0078411aa945447`](https://sepolia.basescan.org/tx/0xf03969ca95d86d34c89754e521b9437d0e9b76ce8fe1992ab0078411aa945447) |
| Customer 0.020000-USDC funding | [`0x5341d88e4b664b729020759f89ac0cbcd38f604d7ad6e5bd7eea02964eb32e6c`](https://sepolia.basescan.org/tx/0x5341d88e4b664b729020759f89ac0cbcd38f604d7ad6e5bd7eea02964eb32e6c) |
| GenLayer registration | [`0xa7652ddd666b2b7d89b07d68f0d391957eb9a0d65021cf23eca8f85d2cfd7c62`](https://explorer-studio.genlayer.com/transactions/0xa7652ddd666b2b7d89b07d68f0d391957eb9a0d65021cf23eca8f85d2cfd7c62) |
| GenLayer customer-funding acknowledgement | [`0x75c809e9ec3190bcde3fc87917b21229e1db834155494e42dc7702bafae80bb2`](https://explorer-studio.genlayer.com/transactions/0x75c809e9ec3190bcde3fc87917b21229e1db834155494e42dc7702bafae80bb2) |
| GenLayer completed-window claim | [`0xbbac31abfc4e347ddb7038c95d940c96e73101ae3cbcd3cc3445c6e384ceadc8`](https://explorer-studio.genlayer.com/transactions/0xbbac31abfc4e347ddb7038c95d940c96e73101ae3cbcd3cc3445c6e384ceadc8) |
| Matching Base claim lock | [`0xa07dfcda2ba79edd114f7d1a576475b1395643e5c27a64404c0a7f77c13e5027`](https://sepolia.basescan.org/tx/0xa07dfcda2ba79edd114f7d1a576475b1395643e5c27a64404c0a7f77c13e5027) |
| Independent GenLayer evaluation | [`0xdeec7fed715831ff06970c07c21e504840682385981ac50280224a4a7855f225`](https://explorer-studio.genlayer.com/transactions/0xdeec7fed715831ff06970c07c21e504840682385981ac50280224a4a7855f225) |
| Final claim after the full challenge window | [`0x506b7bb546110d377290075ff6a90e9d5e8b26188de91c46453e559b2e6fcc57`](https://explorer-studio.genlayer.com/transactions/0x506b7bb546110d377290075ff6a90e9d5e8b26188de91c46453e559b2e6fcc57) |
| Deliberately unsupported relayer allocation | [`0x334a9dadb2bf5832e5e13ff3c1207caa838b1590464d5c03d6cc9e23da8ccec9`](https://sepolia.basescan.org/tx/0x334a9dadb2bf5832e5e13ff3c1207caa838b1590464d5c03d6cc9e23da8ccec9) |
| Customer veto during mandatory delay | [`0x621ddc551b535a3b83df9afe16740515894401dbfc116457dae241ffb7443ad5`](https://sepolia.basescan.org/tx/0x621ddc551b535a3b83df9afe16740515894401dbfc116457dae241ffb7443ad5) |

The evaluation finalized after two consensus rounds with three final `AGREE`
votes. It conservatively returned `PROVISIONAL_INCONCLUSIVE`: GitHub was the
only source relevant to the covered GitHub Actions service, while the OpenAI
and AWS sources correctly reported service mismatch. No fabricated breach or
payout was inferred from unrelated sources.

After the full ten-minute GenLayer challenge window, the claim finalized as
`FINALIZED_INCONCLUSIVE`. To exercise the compromised-relayer defense, the
isolated relayer proposed the entire 0.120000-USDC balance to the customer even
though that allocation is unsupported by the ruling. The customer vetoed it
successfully. On-chain readback now reports status `Disputed` (`6`), the frozen
claim hash and evidence digest above, payout `120000`, refund `0`, and
`vetoed=true`; no USDC moved. The verifier must reject this proposal rather
than attest it. The contract's safety delay makes rejection eligible at
**16 October 2026, 21:05:34 WAT**. This timestamp is documented explicitly;
the delay was not bypassed or simulated and the unfinished rejection is not
misrepresented as completed evidence.

The first attempted registration, transaction
[`0xeb2a…beff`](https://explorer-studio.genlayer.com/transactions/0xeb2a4abb441a5790b22e27daefa6df28257fdc739ba76122062520b844c5beff),
was intentionally not counted as success: v0.10 rolled it back with
`[EXPECTED] Evidence sources invalid` because only one source was supplied.
This is retained as public negative-path evidence.

## Historical v0.8 positive challenged-breach trace

The prior v0.8/v0.5 pair completed the funded trace below. It is retained as historical execution evidence only; its database mirror was cleared during the later contract migrations. No user sessions or authentication records were deleted.

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
forge test -vvv                                -> 13 passed
backend npm run build                          -> passed
frontend tsc --noEmit + npm run lint           -> passed
```

Direct Mode includes adversarial leader-minute, service, semantic-maintenance, quotation, timestamp, spoofed-Statuspage-host, actual-interval, ambiguous-transition, and Base-ID-squatting cases. Foundry additionally covers unauthorized role assignment, fabricated ruling rejection, corrected allocation after a compromised proposal, permissionless execution when the resolver is unavailable, verifier rejection/recovery, and mutual-consent-only abandonment.

## Operations and frontend behavior

- The frontend switches to Base Sepolia before ERC-20 approvals/funding and to GenLayer for adjudication writes. Submitted → consensus → finalized progress is visible for GenLayer writes.
- Base writes re-read the injected wallet account after switching networks and let that wallet/RPC estimate gas; no fixed client-side gas ceiling can suppress the signing prompt.
- Dispute resolution is a two-key, receipt-checked operator command—not an API route. It reads the finalized GenLayer claim, derives the allocation itself, has the verifier attest it, and only then asks the resolver to apply it.
- Query surfaces poll every three seconds, refetch on focus/reconnect, and are invalidated after successful writes. Base actions additionally perform a receipt/state readback.
- The registry contains only rows indexed from the active GenLayer address. It no longer displays static “verification scenarios” as SLAs.
- A contract migration requires changing Fly/Vercel address configuration, redeploying both, clearing only `SlaAgreement`, `Claim`, `Challenge`, and index offsets, then resetting the cursor. It never deletes Base escrow history.

## Comparison

The immutable Uptime comparison starts from the requested Uptime baseline, not Obolus:

[`9c45aaf364e0e942b7e3beb2fc16afe8dc836cd2...main`](https://github.com/zoefunds/uptime-arbiter/compare/9c45aaf364e0e942b7e3beb2fc16afe8dc836cd2...main)
