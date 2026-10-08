# Base Sepolia USDC / GenLayer adjudication milestone

## Delivered architecture

Uptime Arbiter now has a strict split trust boundary:

- Base Sepolia is the only asset layer. `BaseUsdcEscrow` holds official six-decimal Base Sepolia USDC at `0x036CbD53842c5426634e7929541eC2318f3dCF7e` and is the only contract that can escrow, refund, or pay USDC.
- GenLayer StudioNet is the adjudication layer. `UptimeArbiter.py` stores SLA evidence terms, receives claims, produces adjudication outcomes, and records the two Base funding receipts. It cannot move assets.
- The backend indexes GenLayer state and relays terminal verdicts to Base only after validating that the requested payout exactly matches the Base escrow balance.

## Final deployed contracts

- Base Sepolia escrow: `0x5b15a8b6c7BD8C3fB104332A61dA2a5912290794`
  - deployment: `0xa76696958048d64daad02eed5ce3d48ba5f890e80872c071beb66e93a6a90b88`
- Final GenLayer adjudicator: `0xcACB25F194b0821A74B3978B67acD7719c7E4F5C`
  - deployment: `0xe4ebfdd5dd2d3ac9dc1b8ecb8985a8a2e021c667733cd99db396ba583a718ee6`

The GenLayer contract normalizes browser-supplied customer addresses into GenLayer `Address` values and converts the wire-level 256-bit Base transaction value back to a canonical 32-byte `0x…` receipt. Provider funding is recorded atomically during SLA registration.

## Cross-chain confirmation model

The registry displays only normal SLAs from the final GenLayer contract—never seeded test cards or a separate verification view. `/verification` redirects to `/registry`.

For every user-created SLA, the frontend now derives the Base agreement ID from the mined `AgreementProposed` event rather than guessing the next counter. It then reads the Base escrow until it proves the exact provider, customer, USDC amounts, and provider deposit. Only after that proof does it switch to StudioNet and submit `register_adjudication` with the real Base funding transaction receipt.

The backend performs a second bounded post-write read-back: it searches final GenLayer state for the same Base agreement ID, provider, and funding receipt, mirrors the matching SLA into Postgres, and returns its real SLA ID. A slow StudioNet response produces a clear recovery message and disables re-submission; it never encourages a duplicate USDC deposit.

## Backend and frontend deployment

- A clean Fly application/database pair is used: `uptime-arbiter-usdc-api` and `uptime-arbiter-usdc-db`.
- The old indexed SLA tables and cursor were truncated before the final contract was indexed; the registry now contains only rows from the final contract.
- The backend is live at `https://uptime-arbiter-usdc-api.fly.dev/healthz` and indexes the final GenLayer address. It projects the on-chain Base receipts into the registry's funded/co-signed state.
- The Vercel production app is live at `https://uptime-arbiter.vercel.app`, configured for the final Base escrow and GenLayer adjudicator.
- The Register SLA autofill uses three publicly reachable machine-readable evidence sources (GitHub, OpenAI, and AWS status endpoints), valid terms, a valid EVM address, and six-decimal USDC values accepted by the contracts.
- Registration now executes the user-signed cross-chain sequence explicitly: switch to Base Sepolia, propose the SLA, approve the exact provider USDC amount, deposit that USDC into `BaseUsdcEscrow`, read back the on-chain escrow state, then switch to StudioNet and register the adjudication terms. A failed or rejected step is shown to the user and stops the sequence; it is never silently skipped.

## Validation performed

- `forge test -vvv`: three escrow lifecycle tests passed (partial breach, no breach, and expiry refund).
- `frontend: npx tsc --noEmit`: passed during the production Vercel build.
- `backend: npm run build`: run before final Fly deployment.
- Live GenLayer readback verified the final-contract `SLA-1` record and its Base provider-funding receipt.
- Live backend `GET /slas?limit=10` returned only final-contract registry data after database cleanup.

## Source comparison

[Latest milestone update](https://github.com/zoefunds/uptime-arbiter/compare/548fa69...e0a1c9c)
