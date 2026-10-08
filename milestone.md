# Base Sepolia USDC / GenLayer adjudication milestone

## Delivered architecture

Uptime Arbiter now has a strict split trust boundary:

- Base Sepolia is the only asset layer. `BaseUsdcEscrow` holds official six-decimal Base Sepolia USDC at `0x036CbD53842c5426634e7929541eC2318f3dCF7e` and is the only contract that can escrow, refund, or pay USDC.
- GenLayer StudioNet is the adjudication layer. `UptimeArbiter.py` stores SLA evidence terms, receives claims, produces adjudication outcomes, and records the two Base funding receipts. It cannot move assets.
- The backend indexes GenLayer state and relays terminal verdicts to Base only after validating that the requested payout exactly matches the Base escrow balance.

## Final deployed contracts

- Base Sepolia escrow: `0x5b15a8b6c7BD8C3fB104332A61dA2a5912290794`
  - deployment: `0xa76696958048d64daad02eed5ce3d48ba5f890e80872c071beb66e93a6a90b88`
- Final GenLayer adjudicator: `0x7ffcD2869bb0121dFD2E36A2164c36f0e508C333`
  - deployment: `0xfa27cbf655c3b8eb98aad174f1df7bd4100c08fba13566d86cde358388e25cf9`

The GenLayer contract converts the wire-level 256-bit transaction value back to a canonical 32-byte `0x…` Base transaction hash before storing it. This matches StudioNet's hash encoding and keeps the normal frontend funding flow intact.

## Live cross-chain verification

Three real Base Sepolia agreements were proposed and fully funded, then registered as `SLA-1` through `SLA-3` on the final GenLayer contract. Each GenLayer readback contains the matching Base agreement ID plus both actual USDC funding transactions:

| GenLayer SLA | Base agreement | Provider funding receipt | Customer funding receipt |
| --- | ---: | --- | --- |
| SLA-1 | 1 | `0x342695f9abbdaf11c78882c22372393ac1906688537ca3a615b737f91c6d7088` | `0xba30d263f6b8aa003788b9b3df620a6cd7b0c1000f9189c6cc98f5d0bebc2809` |
| SLA-2 | 2 | `0xe8c95ce7ba2537c30cb0899e1c7200ffc2128d228b24e3515f3d43bb493a4aab` | `0x358944f6c2712e660a9487e8b50479b299fdec7f0229be21480725b4de346a81` |
| SLA-3 | 3 | `0xec51d08d33419a3894010514347a1a7100491b270c6df477a2606b818d0b241f` | `0x8040df4b49a5a2dfa05f9e84cf0d2613f0c09886b7054ff7813960ebac3d2ad2` |

Each Base agreement holds exactly 1.200000 USDC: 1.000000 USDC provider escrow and 0.200000 USDC customer bond. The three records display as ordinary active SLAs in the SLA Registry—not placeholder cards or a separate verification page. `/verification` redirects to `/registry`.

## Backend and frontend deployment

- A clean Fly application/database pair is used: `uptime-arbiter-usdc-api` and `uptime-arbiter-usdc-db`.
- The old indexed SLA tables and cursor were truncated before the final contract was indexed; no old-contract registry rows remain.
- The backend is live at `https://uptime-arbiter-usdc-api.fly.dev/healthz` and indexes the final GenLayer address. It projects the on-chain Base receipts into the registry's funded/co-signed state.
- The Vercel production app is live at `https://uptime-arbiter.vercel.app`, configured for the final Base escrow and GenLayer adjudicator.
- The Register SLA autofill uses three publicly reachable machine-readable evidence sources (GitHub, OpenAI, and AWS status endpoints), valid terms, a valid EVM address, and six-decimal USDC values accepted by the contracts.
- Registration now executes the user-signed cross-chain sequence explicitly: switch to Base Sepolia, propose the SLA, approve the exact provider USDC amount, deposit that USDC into `BaseUsdcEscrow`, then switch to StudioNet and register the adjudication terms. A failed or rejected step is shown to the user and stops the sequence; it is never silently skipped.

## Validation performed

- `forge test -vvv`: three escrow lifecycle tests passed (partial breach, no breach, and expiry refund).
- `frontend: npx tsc --noEmit`: passed during the production Vercel build.
- `backend: npm run build`: run before final Fly deployment.
- Live GenLayer reads verified all three final SLA IDs, Base agreement IDs, and six funding receipts.
- Live backend `GET /slas?limit=10` returned exactly the three final active SLAs after database cleanup.

## Source comparison

[Baseline to this milestone](https://github.com/zoefunds/uptime-arbiter/compare/77e4efa3f6a5fd46eb77d9ec7bb73c3ef0a0b316...b93f582ebcb231a3ddb0aae2f4ceda3d123987aa)
