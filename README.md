# Uptime Arbiter

Uptime Arbiter is an SLA protocol with a strict two-chain boundary:

- **Base Sepolia is the money chain.** The only asset used is the official six-decimal Base Sepolia USDC at `0x036CbD53842c5426634e7929541eC2318f3dCF7e`. Provider escrow, customer bond, refunds, and verdict payouts are all Base transactions.
- **GenLayer StudioNet is the adjudication chain.** It stores SLA terms and pinned evidence sources, accepts claims, evaluates evidence, and produces an outcome. It never holds USDC and has no asset-transfer authority.
- **The backend is a relay and indexer, not an adjudicator.** It mirrors final GenLayer state to Postgres for the UI and relays an already-resolved verdict to Base only when the exact Base escrow accounting invariant can be satisfied.

## Deployed protocol

| Component | Production value |
| --- | --- |
| Base Sepolia USDC | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| Base escrow | `0x5b15a8b6c7BD8C3fB104332A61dA2a5912290794` |
| GenLayer adjudicator | `0xcACB25F194b0821A74B3978B67acD7719c7E4F5C` |
| Web app | [uptime-arbiter.vercel.app](https://uptime-arbiter.vercel.app) |
| API health check | [uptime-arbiter-usdc-api.fly.dev/healthz](https://uptime-arbiter-usdc-api.fly.dev/healthz) |

`BaseUsdcEscrow.sol` was deployed in Base transaction `0xa76696958048d64daad02eed5ce3d48ba5f890e80872c071beb66e93a6a90b88`; the final GenLayer adjudicator deployment transaction is `0xe4ebfdd5dd2d3ac9dc1b8ecb8985a8a2e021c667733cd99db396ba583a718ee6`.

## Registration and settlement lifecycle

1. The provider connects one wallet and the app explicitly switches it to Base Sepolia.
2. The app checks the provider's Base USDC balance, creates an escrow agreement, obtains approval for the exact provider escrow amount, and calls `fundProvider`.
3. After the Base receipt succeeds, the frontend derives the agreement ID from the `AgreementProposed` event and reads `agreements[id]` until it confirms the provider, customer, agreed amounts, and actual provider deposit.
4. Only after that Base proof does the app switch the wallet to GenLayer StudioNet and call `register_adjudication`, passing the real Base agreement ID and funding transaction receipt.
5. The backend performs a bounded GenLayer read-back for the same Base agreement, provider, and receipt. The UI reports success only when the matching final-contract SLA is found and indexed. If StudioNet is slow, the UI says not to submit or pay again.
6. The customer later funds their Base bond with `fundCustomer`; the funding receipt is recorded on GenLayer. Once both deposits exist, Base marks the agreement active.
7. A customer submits a GenLayer claim. The adjudicator evaluates its pinned public evidence; the backend relays only a resolved decision to Base. `relayAdjudication` requires customer payout plus provider refund to equal all held USDC.

## Contract responsibilities

- `contracts/BaseUsdcEscrow.sol` is the sole USDC custodian. It permits proposal, one exact deposit per party, cancellation/reclaim of a proposed agreement, expiry refunds, and settlement only from its configured relayer.
- `contracts/UptimeArbiter.py` stores the non-custodial SLA/adjudication state. Browser customer addresses are normalized to GenLayer `Address` values; the encoded Base receipt is stored as a canonical 32-byte hash.
- `backend/src/indexer/poll.ts` is a denormalized read cache. It is not a source of SLA, claim, or verdict truth.

## Verification

```bash
forge test -vvv
cd frontend && npx tsc --noEmit
cd ../backend && npm run build
```

The Foundry suite contains three detailed Base escrow lifecycle tests: partial-breach settlement, no-breach full provider refund, and expiry refunds for both parties. They are contract tests, not rows seeded into the registry. The registry intentionally shows only SLAs recorded by the final GenLayer contract; `/verification` redirects to `/registry`.

See [milestone.md](milestone.md) for the deployment record, cross-chain confirmation model, validation record, and comparison link.
