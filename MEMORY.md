# UPTIME ARBITER — Project Memory

Living record of architecture decisions, so future work (mine or yours) doesn't
re-litigate what's already settled. Update this file whenever a decision below
changes.

## Core concept
Onchain SLA-breach adjudication. Provider + customer lock GEN escrow, pin
evidence sources at registration (never at claim time), customer claims a
breach, GenLayer validators independently fetch the pinned sources and reach
consensus on a computed breach-minutes number, a deterministic function turns
that into a payout, either party gets one bonded additive-evidence challenge
round before funds finalize and become withdrawable.

## Locked architecture decisions
- **Backend**: PostgreSQL via Fly Postgres (Docker-orchestrated), Fly.io hosting,
  `min_machines_running=1` + health checks for 24/7 uptime. Backend never
  makes the breach decision or proxies signed transactions — it only indexes
  on-chain events for fast reads.
- **Auth**: wallet-based, SIWE-style message signing. No custody of user keys.
- **Wallet connect UI**: Reown AppKit (WalletConnect). Project ID in `.env`
  as `NEXT_PUBLIC_REOWN_PROJECT_ID`.
- **Rate limiting**: Redis (Upstash), because GenLayer StudioNet enforces a
  30 req/min RPC limit — backend must queue/throttle indexer + write-relay
  calls against that ceiling. `REDIS_URL` in `.env`.
- **Evidence sources**: minimum 3 (max 8), jointly agreed — provider proposes
  at `propose_sla()`, customer must co-sign with a matching source-list
  fingerprint via `co_sign_and_lock_bond()` before the SLA activates.
- **Challenge window**: 72h default, configurable per SLA within [24h, 14d]
  contract-enforced bounds.
- **Token**: real GEN on GenLayer StudioNet throughout. No mock balances, no
  simulated transactions, anywhere in the code path.
- **Socials**: skipped for this build (no OAuth linking).
- **Deployment**: the user deploys the Intelligent Contract themselves via
  GenLayer Studio/CLI (not Claude). After deployment they supply
  `DEPLOYED_CONTRACT_ADDRESS`, which then gets wired into
  `NEXT_PUBLIC_CONTRACT_ADDRESS` / backend config.

## Contract — `contracts/UptimeArbiter.py`
Single Intelligent Contract, 1,461 lines. Passes `genvm-lint check`,
`genvm-lint typecheck`, and `genvm-lint schema` cleanly (schema extraction
succeeding rules out the "could not load contract schema" failure mode).

Runner pin: `py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6`
(the linter flagged a newer runner hash as available, but that hash isn't
fetchable by the local SDK cache for validation — do not switch to it without
re-running the full lint/typecheck/schema pass against it first).

Key design points (see the contract's own header comment for the full trust-
boundary and escrow-discipline writeup):
- Nondeterministic evidence pipeline (`_run_breach_consensus` /
  `_collect_breach_minutes`) is called identically by leader and every
  validator — nobody shares a fetched answer, everyone independently fetches
  every pinned source and derives an aggregate breach-minutes figure.
  Equivalence Principle compares that computed number (median, majority
  quorum, tolerance band), never raw text or JSON shape.
- Deterministic settlement (`_compute_settlement`) is a fully separate
  function — LLM/validators never touch monetary math.
- Escrow ledger fields (`escrow_deposited`, `bond_deposited`) are always
  zeroed and saved *before* any credit is issued (zero-then-transfer), and
  all payouts are pull-based (`withdraw()` is the only function that calls
  `_send_gen`) — reentrancy is structurally closed, not just discouraged.
- Explicit `INCONCLUSIVE` state when fewer than a strict majority of sources
  are reachable/parseable — never silently defaults to "no breach".
- Challenges are additive-only (append sources, never replace/remove the
  original pinned set), bonded, capped at `MAX_CHALLENGE_ROUNDS_PER_CLAIM = 2`.
- Recovery/timeout exits: `reclaim_stale_proposal` (SLA never signed by
  customer), `terminate_expired_sla` (term ended with no open claim) — funds
  can never be permanently stuck.
- Double-claim protection: `sla.active_claim_id` blocks concurrent claims;
  `sla.adjudicated_windows` blocks re-claiming an already-ruled-on window.

## Deployed contract
Live on GenLayer StudioNet at `0x6bd7064ECc72704D156FF5D34B2C7C3fEf9946c6`.
Wired into `.env` (`NEXT_PUBLIC_CONTRACT_ADDRESS`) and `backend/.env`.

## Backend — `backend/` (done)
Fastify API + a separate always-on indexer process, Node/TypeScript, Prisma/
Postgres. Verified end-to-end against the live deployed contract: `/healthz`
green (DB+Redis), SIWE `/auth/nonce` round-trip works, indexer completed a
clean cycle reading `list_sla_ids`/`list_claim_ids` from StudioNet with zero
errors.

- **genlayer-js pin matters**: had to bump from `^0.9.0` to `^1.2.0` —
  `studionet` isn't exported from `genlayer-js/chains` before 1.x, and
  `readContract`'s `args` must be typed `CalldataEncodable[]` (from
  `genlayer-js/types`), not `unknown[]`. If genlayer-js is ever downgraded,
  this breaks silently at the type level, not at runtime, so recheck after
  any version bump.
- **DB boundary**: Postgres (`backend/prisma/schema.prisma`) is a pure read
  cache of the contract's own view methods — `SlaAgreement`/`Claim`/
  `Challenge` tables are written ONLY by `backend/src/indexer/poll.ts`,
  never by an API route. The only backend-owned business state is
  `Session`/`Nonce` (auth) and `IndexerCursor` (sync progress). Re-creating
  write paths for SLA/claim state in the API would recreate the exact
  "backend makes the decision" failure mode the contract exists to avoid.
- **Indexer budget model**: each poll cycle gets a fixed RPC-call budget
  (`MAX_RPC_CALLS_PER_CYCLE = 8` in `poll.ts`), spent first on discovering
  new SLA/claim ids beyond the stored cursor offset, then on refreshing rows
  still in a non-terminal status (PROPOSED/ACTIVE SLAs, unresolved
  claims/challenges). Terminal rows are never re-fetched again — keeps
  steady-state RPC usage bounded no matter how much history accumulates.
- **Rate limiting**: `backend/src/lib/rateLimiter.ts` is a Redis
  sliding-window limiter every outbound StudioNet call goes through,
  capped at 24/min (30 real ceiling − 6 safety margin). Local dev found
  a native Homebrew Postgres already running on :5432 — local dev now
  points there directly (role `uptime_arbiter`, db `uptime_arbiter`,
  `CREATEDB` granted for Prisma's shadow-db migrations) rather than via
  Docker, since Docker's own proxy was already squatting the port too.
- Fly deploy: two process groups (`api`, `indexer`) from one image/Dockerfile,
  both `min_machines_running = 1`, `release_command` runs
  `prisma migrate deploy` on every deploy. See `backend/README.md` for the
  exact `fly launch`/`fly postgres`/`fly secrets` sequence.

## Next phases (not yet built)
1. Frontend (Next.js/Vercel, dark theme per `DESIGN.md` tokens, pages mapped
   from the five HTML prototypes in `~/Documents/stitch_dark_theme_project_design/`
   — landing, SLA registry/dashboard, register-SLA flow, adjudication room,
   vault/settlements — rebuilt against live contract state via `genlayer-js`,
   not copy-pasted static markup). Reown AppKit for wallet connect
   (`NEXT_PUBLIC_REOWN_PROJECT_ID` already in `.env`). Favicon/logo adapted
   from `logo.html`.
2. Actually deploy the backend to Fly.io (built + verified locally, not yet
   shipped) and the frontend to Vercel.

## Source material referenced (read, not copied)
- `~/Downloads/UPTIME-ARBITER.md` — master build prompt / working rules.
- `~/Downloads/JUDGE.md` — the rubric this project is being built to score
  5/5 against on all four axes (GenLayer Fit, Contract Quality, Engineering,
  Frontend/UX).
- Design prototypes (`Breach-adjudication.html`, `landing-page.html`,
  `operation-dashoard.html`, `register_sla_evidence_pinning.html`,
  `settlement_vault_challenge_period.html`, `logo.html`, `DESIGN.md`,
  `landing-page-DESIGN.md`) — used as layout/interaction/token reference for
  rebuilding real pages against live state, not as copy-paste source.
