# Uptime Arbiter frontend

Next.js 16 App Router application using Tailwind v4, wagmi/Reown AppKit,
viem, and `genlayer-js`. It guides one connected wallet through the Base
Sepolia escrow actions and the distinct GenLayer StudioNet adjudication action.

## Production configuration

| Value | Production setting |
| --- | --- |
| App | [uptime-arbiter.vercel.app](https://uptime-arbiter.vercel.app) |
| GenLayer v0.8 contract | `0x92BfA493f7842EA21ED6134C30f8B8fEEd34b188` |
| Base v0.5 escrow | `0x3648226dfaBFE79A1Cf0B708880176904b7b1b6c` |
| Base USDC | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| API | `https://uptime-arbiter-usdc-api.fly.dev` |

The production configuration and API health were rechecked after the v0.8
deployment on 2026-10-15. The registry is backed only by the active contract's
indexer mirror; that mirror was cleared and its cursor reset during migration.

`NEXT_PUBLIC_CONTRACT_ADDRESS` is set in Vercel production. The frontend also
contains the verified final-contract address as a fallback so an absent public
environment variable cannot silently revive an old contract. The site footer
renders the active address; users should verify it shows `0x92Bf...b188` before
signing a GenLayer transaction.

## Registration safety sequence

The register page does not treat a wallet popup as proof of an SLA:

1. It switches the wallet to Base Sepolia, checks Base USDC balance, then asks
   for the Base `propose`, USDC `approve`, and `fundProvider` signatures.
2. It waits for successful Base receipts, reads the agreement ID from the
   `AgreementProposed` log, and repeatedly reads the Base agreement until the
   exact provider/customer/amounts/provider deposit are confirmed.
3. It switches the same wallet to StudioNet and calls GenLayer
   `register_adjudication` with the confirmed Base agreement ID and actual
   provider funding hash.
4. It calls the backend's bounded confirmation endpoint. Success appears only
   after the final GenLayer SLA matching all those values is visible.

If Base money has been confirmed but GenLayer persistence is delayed, the form
is disabled and tells the user not to retry or pay again. This prevents
accidental duplicate escrow deposits. Customer bond funding follows the same
cross-chain principle from the SLA page: Base transfer first, GenLayer receipt
record second, then a bounded backend read-back that immediately refreshes the
SLA to `PROPOSED` or `ACTIVE`.

## Live updates

All live data surfaces use TanStack Query with a three-second polling cadence:
the landing-page protocol ribbon, SLA registry, SLA detail, Base agreement
state, claims list, and claim detail. Queries also refetch when the browser
regains focus or reconnects. A successful user action invalidates every
affected query family (detail, list, claims, and statistics) so the next read
starts immediately rather than waiting for the next cadence. The ribbon shows
its most recent refresh time; a dash while the first request is in flight is a
loading state, not a protocol value.

The production statistic values are backend aggregates of the GenLayer mirror
and Base funding reads. They are not seeded test results and should be treated
as a live operational view, with Base Sepolia remaining the monetary source of
truth.

Lifecycle labels are derived from authoritative Base state rather than old
GenLayer funding acknowledgments. Settled, expired, and cancelled agreements
must never appear active merely because their original deposit fields remain in
the immutable Base agreement struct. The three-second cadence is a freshness
mechanism; transaction completion still requires finalized GenLayer execution
or a successful Base receipt plus contract read-back.

Every GenLayer write exposes submitted, consensus, and finalized progress and
is considered complete only at `FINALIZED` with a successful execution result.
Every Base write switches to chain 84532, confirms the selected signer, waits
for a successful receipt, and reads authoritative contract state. If GenLayer
claim creation succeeds but the subsequent Base lock is interrupted, the SLA
page offers a resume action for that existing claim instead of asking for a
duplicate claim or payment.

## Pages

- `/registry` and `/registry/[slaId]`: final-contract SLA list/details,
  escrow status, customer co-signing, and claim access.
- `/register`: provider Base escrow creation followed by linked GenLayer
  adjudication registration. “Fill Sample Data” uses three real GitHub Status
  API endpoints, internally consistent deadlines, publication/challenge
  windows, and six-decimal USDC values accepted by both contracts.
- `/claims` and `/claims/[claimId]`: adjudication/claim status.
- `/vault`: Base settlement and verdict-relay view.
- `/verification`: redirects to `/registry`; test cards are deliberately not
  presented as SLAs.

## Local development

```bash
npm install
cp .env.local.example .env.local
npm run dev
npx tsc --noEmit
```

Set `NEXT_PUBLIC_REOWN_PROJECT_ID`, `NEXT_PUBLIC_API_BASE_URL`, and the public
network values in `.env.local`. The registry, claims, landing statistics, and
vault pages require a running backend for indexed data. Do not put a private
key in any `NEXT_PUBLIC_*` variable.

## Deployment

```bash
vercel --prod --yes
```

When intentionally migrating the GenLayer contract, set
`NEXT_PUBLIC_CONTRACT_ADDRESS` to the new address and deploy a fresh production
build. Verify the public rendered footer afterward; changing a Vercel value
does not alter an already-built bundle.
