# Uptime Arbiter frontend

Next.js 16 App Router application using Tailwind v4, wagmi/Reown AppKit,
viem, and `genlayer-js`. It guides one connected wallet through the Base
Sepolia escrow actions and the distinct GenLayer StudioNet adjudication action.

## Production configuration

| Value | Production setting |
| --- | --- |
| App | [uptime-arbiter.vercel.app](https://uptime-arbiter.vercel.app) |
| GenLayer v0.10 contract | `0x700D935A78562Dd5FBdfA603bbb5E00C9f521D81` |
| Base v0.8 escrow | `0x9d8A7e19336725E261d2e11aB4171F1748aB0d6d` |
| Base USDC | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| API | `https://uptime-arbiter-usdc-api.fly.dev` |
| Deployment manifest | `https://uptime-arbiter.vercel.app/api/deployment` |

The production configuration uses the v0.10/v0.8 deployment. The registry is backed only by the active contract's
indexer mirror; that mirror was cleared and its cursor reset during migration.
Base writes explicitly switch to Base Sepolia, confirm the selected account,
and rely on the wallet/RPC's gas estimate instead of imposing a fixed
client-side gas limit.

The historical v0.8/v0.5 deployment completed a real challenged breach rather
than a static test card. Its receipt-verified Base execution is
[0x796e…ac8b](https://sepolia.basescan.org/tx/0x796ea0a1398772f6b4cd15cf34c7904b522c8a9345b13afc63ba43a8fd54ac8b).

`NEXT_PUBLIC_CONTRACT_ADDRESS` is set in Vercel production. The frontend also
contains the verified final-contract address as a fallback so an absent public
environment variable cannot silently revive an old contract. The site footer
renders explorer links for both active addresses on every route; users should
verify GenLayer `0x700D...1D81` and Base `0x9d8A...0d6d` before signing.

The browser ABI contains only functions invoked by public user flows. Removed
legacy methods such as `reauthorizeDisputedSettlement` are intentionally absent;
verifier and resolver operations are isolated backend/operator procedures.

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

On 15 October 2026 the production registry was browser-checked after deployment:
it rendered the funded current-version `SLA-1`, provider/customer addresses,
0.100000-USDC provider escrow, `ACTIVE` state, and footer links to GenLayer
`0x700D…1D81` and Base `0x9d8A…0d6d`. A cache-resistant JSON copy of the same
canonical deployment is available at `/api/deployment`.

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
