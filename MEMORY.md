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
Live on GenLayer StudioNet at `0xdeBf80793BD1145B9D195eeD311a01Ba25Eb09d1`
(redeployed from commit `b24e39c` after the DynArray fix below — the
original `0x6bd7064ECc72704D156FF5D34B2C7C3fEf9946c6` deployment is dead,
`propose_sla` always reverts on it, do not reference it anywhere again).
Wired into: root `.env`, `backend/.env`, `frontend/.env.local`, the
`uptime-arbiter-api` Fly secret, and the Vercel `uptime-arbiter` project's
`NEXT_PUBLIC_CONTRACT_ADDRESS` — both backend and frontend redeployed after
the rewiring and reverified live (`/healthz` ok, indexer logs confirm it
restarted pointed at the new address).

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

## Frontend — `frontend/` (done)
Next.js 16 (App Router, Turbopack), Tailwind v4 (CSS-based `@theme`, not a
`tailwind.config.js` — v4 changed that), wagmi + Reown AppKit for wallet
connect, genlayer-js 1.2.0 for direct browser-to-contract reads/writes.
Pages: `/` (landing), `/registry` + `/registry/[slaId]`, `/register`,
`/claims` + `/claims/[claimId]` (adjudication room), `/vault`. Design tokens
in `src/app/globals.css` lifted from `DESIGN.md`. Logo/favicon adapted from
`logo.html`. Verified: clean `tsc`, clean `next build`, all 5 routes return
200 against the live backend, landing/registry/register pages screenshot-
verified in-browser showing real state (0 SLAs, correctly empty; register
page correctly gated behind wallet connect).

- **genlayer-js API surface differs from the hosted docs** for this version
  (1.2.0): there is no `estimateTransactionFeesForWrite` on the client, and
  `writeContract` just takes `{ address, functionName, args, value }`
  directly (no separate `fees` object — that flow is apparently for a
  fee-charging deployment variant, not StudioNet). `waitForTransactionReceipt`
  takes a `status` field typed as the real `TransactionStatus` enum from
  `genlayer-js/types` (e.g. `TransactionStatus.FINALIZED`), not a string
  literal. If genlayer-js is upgraded later, re-verify this — don't trust
  the hosted docs' write-flow snippet blindly, verify against
  `node_modules/genlayer-js/dist/*.d.ts` directly, same as was needed here.
- **Next.js 16 ships an `AGENTS.md`/`CLAUDE.md`** in the scaffold explicitly
  warning that APIs differ from training data and pointing at
  `node_modules/next/dist/docs/` — worth reading before assuming App Router
  behavior carries over unchanged in a future session.
- Wallet-signed write flows (`propose_sla`, `lock_provider_escrow`, etc.)
  are implemented and typecheck/build clean but have NOT been exercised
  end-to-end with a real signing wallet (no browser extension available in
  this environment) — that verification is still owed once deployed.

## Repo & git
Single root git repo at `/Users/macbook/UPTIME-ARBITER` (contract, backend,
frontend all in one repo, matching the "submit the full repo" review
requirement) — NOT one repo per subfolder; `frontend/`'s own nested `.git`
from `create-next-app` was deleted for this reason. Remote:
`https://github.com/zoefunds/uptime-arbiter.git`. Commit identity is
repo-local (`git config user.name/email`, not global) — `zoefunds` /
`preciousmofeoluwa@gmail.com`, no Claude attribution in commit messages.
Commit and push after each meaningful chunk of work, per standing
instruction — don't wait to be asked again.

## Deployment — live
- **Backend**: `uptime-arbiter-api.fly.dev` (Fly.io, app `uptime-arbiter-api`),
  two always-on process groups (`api`, `indexer`) per `fly.toml`, backed by
  Fly Postgres app `uptime-arbiter-db`. `/healthz` green, indexer confirmed
  running against the live contract in Fly logs.
- **Frontend**: `https://uptime-arbiter.vercel.app` (Vercel project
  `uptime-arbiter`, scope `adebiyi2002gmailcoms-projects`). Browser-verified:
  landing page renders, live stats ribbon successfully CORS-fetches from the
  Fly backend and shows real (zeroed) on-chain state, AppKit wallet-connect
  button renders correctly.
- Two real deploy issues hit and fixed, worth remembering for any future
  redeploy of this backend:
  1. **Fly IP provisioning failed on first deploy** ("org_slug is only
     supported with private_v6 type") — fixed by running
     `fly ips allocate-v4 --shared` and `fly ips allocate-v6` manually
     before redeploying.
  2. **`prisma migrate deploy` failed in the release_command machine** with
     an opaque `Error: Schema engine error:` (no detail) — this is the
     classic Prisma-on-`node:20-slim` missing-OpenSSL problem (the
     accompanying warning about defaulting to `openssl-1.1.x` is the tell).
     Confirmed by running the same migration successfully through a local
     `fly proxy` tunnel (which uses the local machine's own OpenSSL, not the
     container's). Fixed by adding
     `apt-get install -y openssl ca-certificates` to the `Dockerfile`'s
     base stage. If this Dockerfile is ever rewritten from scratch, this
     line is easy to drop and the failure it prevents is easy to misdiagnose
     as a DB connectivity problem instead of a missing-library problem.

## Live bug found & fixed: DynArray can't be user-instantiated
First real `propose_sla()` attempt on StudioNet failed with
`TypeError: this class can't be instantiated by user` from
`DynArray[str].__init__`. Root cause: `DynArray` (and presumably `TreeMap`)
are storage-only types — GenVM allocates them only when a value is written
into an actual storage slot (e.g. `self.slas[sla_id] = sla`); calling
`DynArray[str]()` directly in user code, even to build a value for a
not-yet-stored dataclass field, is rejected outright. Fixed by making
`_str_list_to_dynarray()` just return a plain Python `list` — a detached
dataclass instance takes a plain list for a `DynArray`-typed field, and the
runtime does the real conversion at the point the containing object is
actually assigned into storage. Also fixed the one other bare
`DynArray[str]()` call (`adjudicated_windows=[]` in `propose_sla`).
**This means the contract already deployed at
`0x6bd7064ECc72704D156FF5D34B2C7C3fEf9946c6` had this bug baked into its
immutable bytecode and cannot self-heal — it must be redeployed from the
fixed `contracts/UptimeArbiter.py` (commit `cd72be2`) before `propose_sla`
will work at all.** Once redeployed, the new address needs to be re-wired
into: root `.env`, `backend/.env`, `backend` Fly secrets
(`fly secrets set NEXT_PUBLIC_CONTRACT_ADDRESS=... -a uptime-arbiter-api`
+ redeploy), and the Vercel env var (`vercel env rm/add
NEXT_PUBLIC_CONTRACT_ADDRESS` + redeploy) — same sequence as the original
wiring, just pointed at the new address.

## Live bug found & fixed: BigInt JSON serialization
First real `propose_sla()` (label "GitHub Actions Runner Fleet", `SLA-1`)
succeeded on-chain and the indexer correctly picked it up — but `/slas`
then 500'd on every request with `Do not know how to serialize a BigInt`,
which made the registry page spin forever (no error surfaced client-side
because the fetch itself succeeded, it just returned a 500 the query kept
retrying). Cause: `prisma/schema.prisma`'s `BigInt` columns
(`registrationDeadlineTs`, `termStartTs`, `termEndTs`, `windowStartTs`,
`windowEndTs`, `challengeDeadlineTs`) come back from Prisma as native JS
`BigInt`, which `JSON.stringify` throws on unconditionally. Fixed with a
global `BigInt.prototype.toJSON` returning `this.toString()` at the top of
`backend/src/server.ts` — serializes as a decimal string, consistent with
how every wei amount in this API is already represented as a string (never
a JS number, to avoid precision loss). If this pattern is ever refactored
away (e.g. moving off Prisma, or switching serializers), re-verify BigInt
columns don't silently break every route that returns them again.

## Next phases (not yet built)
1. End-to-end verification with a real wallet: propose an SLA, fund escrow
   from both sides, submit a claim, trigger evaluation, optionally
   challenge, finalize, withdraw — the full lifecycle, live on StudioNet.
   Not yet done — needs a human with a real wallet extension, not possible
   from this environment.

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
