# Uptime Arbiter frontend

Next.js 16 App Router application using Tailwind v4, wagmi/Reown AppKit,
viem, and `genlayer-js`. It guides one connected wallet through the Base
Sepolia escrow actions and the distinct GenLayer StudioNet adjudication action.

## Production configuration

| Value | Production setting |
| --- | --- |
| App | [uptime-arbiter.vercel.app](https://uptime-arbiter.vercel.app) |
| GenLayer contract | `0xcACB25F194b0821A74B3978B67acD7719c7E4F5C` |
| Base escrow | `0x5b15a8b6c7BD8C3fB104332A61dA2a5912290794` |
| Base USDC | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| API | `https://uptime-arbiter-usdc-api.fly.dev` |

`NEXT_PUBLIC_CONTRACT_ADDRESS` is set in Vercel production. The frontend also
contains the verified final-contract address as a fallback so an absent public
environment variable cannot silently revive an old contract. The site footer
renders the active address; users should verify it shows `0xcAC...4F5C` before
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

If Base money has been confirmed but GenLayer indexing is delayed, the form is
disabled and tells the user not to retry or pay again. This prevents accidental
duplicate escrow deposits. Customer bond funding follows the same cross-chain
principle from the SLA page: Base transfer first, then GenLayer receipt record.

## Pages

- `/registry` and `/registry/[slaId]`: final-contract SLA list/details,
  escrow status, customer co-signing, and claim access.
- `/register`: provider Base escrow creation followed by linked GenLayer
  adjudication registration. “Fill Sample Data” uses real public GitHub,
  OpenAI, and AWS status endpoints with contract-valid terms.
- `/claims` and `/claims/[claimId]`: adjudication/claim status.
- `/vault`: Base settlement view.
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
network values in `.env.local`. The registry, claims, and vault pages require a
running backend for indexed data.

## Deployment

```bash
vercel --prod --yes
```

When intentionally migrating the GenLayer contract, set
`NEXT_PUBLIC_CONTRACT_ADDRESS` to the new address and deploy a fresh production
build. Verify the public rendered footer afterward; changing a Vercel value
does not alter an already-built bundle.
