# Uptime Arbiter — Frontend

Next.js 16 (App Router, Turbopack), Tailwind v4, wagmi + Reown AppKit for
wallet connect, genlayer-js for direct browser-to-contract reads/writes.

**Currently live**: https://uptime-arbiter.vercel.app (Vercel project
`uptime-arbiter`), tracking contract `0x8aB7b78e29D9af2b66A7B01E1D41E56Fb6595614`
on GenLayer StudioNet via backend `https://uptime-arbiter-api.fly.dev`.

## Trust boundary

Every write (`propose_sla`, `lock_provider_escrow`, `co_sign_and_lock_bond`,
`submit_claim`, `evaluate_claim`, `file_challenge`, `resolve_challenge`,
`finalize_claim`, `withdraw`) is signed by the connected wallet and sent
directly to the deployed contract via `src/lib/genlayer.ts` — never proxied
through the backend. The backend (`NEXT_PUBLIC_API_BASE_URL`) is read-only:
paginated SLA/claim/challenge listings and live withdrawable-balance lookups.

Writes wait for the contract transaction to reach `ACCEPTED` (not
`FINALIZED` — state changes already apply at `ACCEPTED`; `FINALIZED` only
additionally means the appeal window has closed, and routinely takes
longer than a UI should block on). If that wait itself times out, the
write is NOT treated as failed — the transaction was already submitted by
that point — it surfaces as a `warning`, not an `error`. See
`src/lib/genlayer.ts` and `src/hooks/use-genlayer-write.ts`.

## Local development

```bash
npm install
cp .env.local.example .env.local   # fill in values, or copy from repo root .env
npm run dev
```

Requires the backend running locally (see `../backend/README.md`) for the
registry/claims/vault pages to have data to show; the landing page's live
stats ribbon degrades gracefully if the backend is unreachable.

## Deploying to Vercel

The app is already deployed (see above). To redeploy after code changes:

```bash
vercel deploy --prod --scope adebiyi2002gmailcoms-projects
```

To change an env var (e.g. after redeploying the contract):

```bash
vercel env rm NEXT_PUBLIC_CONTRACT_ADDRESS production --yes --scope adebiyi2002gmailcoms-projects
echo "0x..." | vercel env add NEXT_PUBLIC_CONTRACT_ADDRESS production --scope adebiyi2002gmailcoms-projects
vercel deploy --prod --scope adebiyi2002gmailcoms-projects
```

**Setting up from scratch** (a new Vercel project):

```bash
vercel link --yes --project uptime-arbiter --scope <your-scope>
vercel env add NEXT_PUBLIC_REOWN_PROJECT_ID production --scope <your-scope>
vercel env add NEXT_PUBLIC_CONTRACT_ADDRESS production --scope <your-scope>
vercel env add NEXT_PUBLIC_GENLAYER_CHAIN_ID production --scope <your-scope>
vercel env add NEXT_PUBLIC_GENLAYER_RPC_URL production --scope <your-scope>
vercel env add NEXT_PUBLIC_API_BASE_URL production --scope <your-scope>
vercel deploy --prod --scope <your-scope>
```

## Pages

- `/` — landing, protocol pitch, live stats ribbon
- `/registry`, `/registry/[slaId]` — browse SLAs, fund/co-sign/cancel/submit claims
- `/register` — 4-step SLA proposal form (`propose_sla`, including pinned
  exclusion terms) with a "Fill Sample Data" button for quick testing
- `/claims`, `/claims/[claimId]` — adjudication room: trigger evaluation,
  file/resolve challenges, finalize settlement
- `/vault` — per-wallet withdrawable balance + `withdraw()`

Navigation below the `xl` breakpoint uses a hamburger menu
(`src/components/site-header.tsx`) — the nav previously had no mobile
fallback at all; fixed after a dedicated mobile-responsiveness pass (see
`MEMORY.md`).
