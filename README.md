# Uptime Arbiter

Uptime Arbiter is an SLA protocol with a strict two-chain boundary:

- **Base Sepolia is the money chain.** The only asset used is the official six-decimal Base Sepolia USDC at `0x036CbD53842c5426634e7929541eC2318f3dCF7e`. Provider escrow, customer bond, refunds, and verdict payouts are all Base transactions.
- **GenLayer StudioNet is the adjudication chain.** It stores SLA terms and pinned evidence sources, accepts claims, evaluates evidence, and produces an outcome. It never holds USDC and has no asset-transfer authority.
- **The backend is a relay and indexer, not an adjudicator.** It mirrors final GenLayer state to Postgres for the UI and relays an already-resolved verdict to Base only when the exact Base escrow accounting invariant can be satisfied.

## Deployed protocol

| Component | Production value |
| --- | --- |
| Base Sepolia USDC | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| Base escrow | `0x9656B5a51E94C7bDE57c3370420d617F7Cc2bD98` |
| GenLayer adjudicator | `0x1798573a1C99b5250881666999d8C3486E5cA4f1` |
| Web app | [uptime-arbiter.vercel.app](https://uptime-arbiter.vercel.app) |
| API health check | [uptime-arbiter-usdc-api.fly.dev/healthz](https://uptime-arbiter-usdc-api.fly.dev/healthz) |

The current Base escrow deployment transaction is `0xc565910a7461dec8f8d3f8052358c63df055f78989155d7d03bdf638694c7648`; the current GenLayer adjudicator deployment transaction is `0x50d2071760a3840d28490a0a03dbbe17c54dfc489dfa8c58b3c28910db8762ee`.

## Registration, activation, adjudication, and settlement lifecycle

1. The provider connects one wallet and the app explicitly switches it to Base Sepolia.
2. The app checks the provider's Base USDC balance, creates an escrow agreement, obtains approval for the exact provider escrow amount, and calls `fundProvider`.
3. After the Base receipt succeeds, the frontend derives the agreement ID from the `AgreementProposed` event and reads `agreements[id]` until it confirms the provider, customer, agreed amounts, and actual provider deposit.
4. Only after that Base proof does the app switch the wallet to GenLayer StudioNet and call `register_adjudication`, passing the real Base agreement ID and funding transaction receipt.
5. The backend performs a bounded GenLayer read-back for the same Base agreement, provider, and receipt. The UI reports success only when the matching final-contract SLA is found and indexed. If StudioNet is slow, the UI says not to submit or pay again.
6. The customer later switches to Base Sepolia, approves exactly the on-chain customer-bond amount, and calls `fundCustomer`. After the mined Base receipt, the app records that receipt on GenLayer and calls the backend's bounded funding-confirmation route.
7. The confirmation route reads GenLayer directly until the matching funding receipt is persisted, mirrors the result into Postgres, and returns `PROPOSED` or `ACTIVE`. The UI invalidates the SLA, registry, claims, and protocol-statistic queries immediately; it does not wait for the background indexer to mark an activated SLA.
8. A customer submits a GenLayer claim. The adjudicator evaluates its pinned public evidence; the backend relays only a resolved decision to Base. `relayAdjudication` requires customer payout plus provider refund to equal all held USDC.

## Live-state model

The browser never treats an old page render as protocol state. Registry, SLA,
claim, Base-agreement, and protocol-statistic queries refresh every three
seconds, refresh again after a reconnect or window focus, and are invalidated
after an action. The post-write registration and funding routes add a stronger
guarantee for the two operations that can cause a USDC payment: they bypass the
ordinary indexer queue, read GenLayer state back directly, and update the
non-authoritative cache before the frontend reports completion.

The landing-page statistics are real cache aggregates, not demonstration
values. They report registered/active SLAs, submitted/breach claims, filed
challenges, and Base USDC held by active agreements. The indexer reads the
corresponding Base escrow agreement when it mirrors an SLA so provider escrow,
customer bond, and deposits remain anchored to Base rather than inferred from
GenLayer.

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

The Foundry suite contains three detailed Base escrow lifecycle tests: partial-breach settlement, no-breach full provider refund, and expiry refunds for both parties. They are contract tests, not rows seeded into the registry. No E2E test data was created on the final deployment. The registry intentionally shows only SLAs recorded by the final GenLayer contract; `/verification` redirects to `/registry`.

See [milestone.md](milestone.md) for the deployment record, cross-chain confirmation model, validation record, and comparison link.
