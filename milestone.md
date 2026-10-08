# Base Sepolia USDC / GenLayer adjudication milestone

## Delivered architecture

Uptime Arbiter now has a strict split trust boundary:

- Base Sepolia is the only asset layer. `BaseUsdcEscrow` holds official six-decimal Base Sepolia USDC at `0x036CbD53842c5426634e7929541eC2318f3dCF7e` and is the only contract that can escrow, refund, or pay USDC.
- GenLayer StudioNet is the adjudication layer. `UptimeArbiter.py` stores SLA evidence terms, receives claims, produces adjudication outcomes, and records the two Base funding receipts. It cannot move assets.
- The backend indexes GenLayer state and relays terminal verdicts to Base only after validating that the requested payout exactly matches the Base escrow balance.

## Final deployed contracts

- Base Sepolia escrow: `0x9656B5a51E94C7bDE57c3370420d617F7Cc2bD98`
  - deployment: `0xc565910a7461dec8f8d3f8052358c63df055f78989155d7d03bdf638694c7648`
- Final GenLayer adjudicator: `0x1798573a1C99b5250881666999d8C3486E5cA4f1`
  - deployment: `0x50d2071760a3840d28490a0a03dbbe17c54dfc489dfa8c58b3c28910db8762ee`

The GenLayer contract normalizes browser-supplied customer addresses into GenLayer `Address` values and converts the wire-level 256-bit Base transaction value back to a canonical 32-byte `0x…` receipt. Provider funding is recorded atomically during SLA registration. The initial cache was intentionally empty after the address migration; any current registry entry is an ordinary user-created SLA on these final contracts, not seeded test data.

## Cross-chain confirmation model

The registry displays only normal SLAs from the final GenLayer contract—never seeded test cards or a separate verification view. `/verification` redirects to `/registry`.

For every user-created SLA, the frontend now derives the Base agreement ID from the mined `AgreementProposed` event rather than guessing the next counter. It then reads the Base escrow until it proves the exact provider, customer, USDC amounts, and provider deposit. Only after that proof does it switch to StudioNet and submit `register_adjudication` with the real Base funding transaction receipt.

The backend performs a second bounded post-write read-back: it searches final GenLayer state for the same Base agreement ID, provider, and funding receipt, mirrors the matching SLA into Postgres, and returns its real SLA ID. A slow StudioNet response produces a clear recovery message and disables re-submission; it never encourages a duplicate USDC deposit.

Provider and customer funding receive the same protection after registration.
The Base transaction is mined first; the user then signs GenLayer
`record_base_funding`. The backend's `confirm-funding` endpoint reads the
persisted SLA directly, verifies the exact Base receipt in the correct role,
updates the cache, and returns the resulting `PROPOSED` or `ACTIVE` lifecycle
state. The frontend invalidates the SLA detail, registry, claims, and
statistics queries at once.

### Live UI synchronization

All live protocol views poll on a three-second cadence and refetch on browser
focus or network reconnect. This covers the landing statistic ribbon, registry,
SLA details, Base-agreement display, claims list, and claim detail. Post-write
confirmations provide immediate read-after-write behavior for the payment paths;
ordinary background polling remains a resilience mechanism rather than the
only way a new status becomes visible.

The landing statistic ribbon is derived from the real mirrored state: total
registered SLAs, active SLAs, submitted claims, confirmed/partial breaches,
filed challenges, and Base USDC held by active agreements. While indexing an
SLA, the backend reads the Base escrow agreement and persists the configured
escrow/bond as well as actual provider/customer deposits. This prevents the UI
from presenting GenLayer as an asset ledger.

## Backend and frontend deployment

- A clean Fly application/database pair is used: `uptime-arbiter-usdc-api` and `uptime-arbiter-usdc-db`.
- The old indexed SLA tables and cursor were truncated before the final contract was indexed; the registry now contains only rows from the final contract.
- The backend is live at `https://uptime-arbiter-usdc-api.fly.dev/healthz` and indexes the final GenLayer address. It projects the on-chain Base receipts into the registry's funded/co-signed state.
- The Vercel production app is live at `https://uptime-arbiter.vercel.app`, configured for the final Base escrow and GenLayer adjudicator.
- The Register SLA autofill uses three publicly reachable machine-readable evidence sources (GitHub, OpenAI, and AWS status endpoints), valid terms, a valid EVM address, and six-decimal USDC values accepted by the contracts.
- Registration now executes the user-signed cross-chain sequence explicitly: switch to Base Sepolia, propose the SLA, approve the exact provider USDC amount, deposit that USDC into `BaseUsdcEscrow`, read back the on-chain escrow state, then switch to StudioNet and register the adjudication terms. A failed or rejected step is shown to the user and stops the sequence; it is never silently skipped.

### User-visible recovery behavior

- A Base receipt with status other than `success` stops the workflow.
- The Base agreement ID is decoded from the provider's actual proposal event; the UI does not pre-compute or assume the next agreement number.
- The provider's USDC balance is checked before any proposal transaction, and the post-deposit read-back checks the exact expected USDC amount rather than merely a non-zero balance.
- A GenLayer transaction reaching submission/consensus is not presented as a completed SLA by itself. The frontend waits for backend confirmation of the persisted final-contract record with the same Base agreement, provider, and Base receipt.
- If that confirmation is slow, the form is locked and the message explicitly says not to make another USDC payment. The SLA Registry remains the source of ordinary user-facing SLA records.

## Validation performed

- `frontend: npx tsc --noEmit`: passes for the live-refresh and statistic UI.
- `backend: npm run build`: passes for the Base-funding mirror and live-statistic API.
- The final Base and GenLayer contracts were deployed without any automated E2E funding or settlement run, per instruction.
- The backend cache was truncated after the address switch; the previous-contract records were removed without deleting any on-chain history.
- Production `/protocol/stats` now returns live counts and Base-held USDC from the final-contract mirror rather than placeholder statistics.

## Source comparison

[Latest milestone update](https://github.com/zoefunds/uptime-arbiter/compare/657e906b2fae594ee6d2e075d93a844b72094ce3...main)
