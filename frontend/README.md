# Uptime Arbiter — Frontend

Next.js 16 (App Router, Turbopack), Tailwind v4, wagmi + Reown AppKit for
wallet connect, genlayer-js for direct browser-to-contract reads/writes.

## Trust boundary

Every write (`propose_sla`, `lock_provider_escrow`, `co_sign_and_lock_bond`,
`submit_claim`, `evaluate_claim`, `file_challenge`, `resolve_challenge`,
`finalize_claim`, `withdraw`) is signed by the connected wallet and sent
directly to the deployed contract via `src/lib/genlayer.ts` — never proxied
through the backend. The backend (`NEXT_PUBLIC_API_BASE_URL`) is read-only:
paginated SLA/claim/challenge listings and live withdrawable-balance lookups.

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

```bash
vercel link
vercel env add NEXT_PUBLIC_REOWN_PROJECT_ID
vercel env add NEXT_PUBLIC_CONTRACT_ADDRESS
vercel env add NEXT_PUBLIC_GENLAYER_CHAIN_ID
vercel env add NEXT_PUBLIC_GENLAYER_RPC_URL
vercel env add NEXT_PUBLIC_API_BASE_URL   # the deployed Fly.io backend URL
vercel deploy --prod
```

## Pages

- `/` — landing, protocol pitch, live stats ribbon
- `/registry`, `/registry/[slaId]` — browse SLAs, fund/co-sign/cancel/submit claims
- `/register` — 3-step SLA proposal form (`propose_sla`)
- `/claims`, `/claims/[claimId]` — adjudication room: trigger evaluation,
  file/resolve challenges, finalize settlement
- `/vault` — per-wallet withdrawable balance + `withdraw()`
