# Uptime Arbiter — Backend

Fastify API + background indexer, mirroring `contracts/UptimeArbiter.py`
into Postgres for fast reads. Never makes a business decision — see the
header comment in `prisma/schema.prisma` and `src/genlayer/client.ts`.

**Currently live**:
- API: https://uptime-arbiter-api.fly.dev (`fly.io` app `uptime-arbiter-api`)
- Postgres: Fly Postgres app `uptime-arbiter-db`
- Contract tracked: `0x61D6F3bdf53118523572a141F7E1904591147F94` on GenLayer StudioNet

## Local development

Requires a local Postgres (native Homebrew/apt install, or your own
container) and the shared Redis (Upstash URL already in `.env`).

```bash
npm install
npx prisma migrate dev   # first run only
npm run dev              # API on :8080
npm run indexer          # separate terminal — background sync loop
```

`GET /healthz` reports DB + Redis connectivity.

## Deploying to Fly.io

The app is already deployed (see above). To redeploy after code changes:

```bash
fly deploy --app uptime-arbiter-api
```

`release_command` runs `prisma migrate deploy` automatically, so schema
changes ship safely on every deploy. To point at a redeployed contract
address:

```bash
fly secrets set NEXT_PUBLIC_CONTRACT_ADDRESS="0x..." --app uptime-arbiter-api
```

(Setting a secret automatically triggers a rolling redeploy — no separate
`fly deploy` needed.) After doing this, the Postgres index cache should
usually be cleared too, since a new contract's own id counters (`SLA-1`,
`CLM-1`, ...) will collide with whatever the previous contract already
indexed:

```bash
fly postgres connect -a uptime-arbiter-db --database uptime_arbiter_api
# TRUNCATE TABLE "SlaAgreement", "Claim", "Challenge" RESTART IDENTITY;
# UPDATE "IndexerCursor" SET "slaOffset" = 0, "claimOffset" = 0, "lastRunAt" = NULL, "lastError" = NULL, "consecutiveErrors" = 0 WHERE id = 'default';
```

**Setting up from scratch** (a fresh Fly org/account, not redeploying the
existing app):

```bash
fly apps create uptime-arbiter-api
fly postgres create --name uptime-arbiter-db --region iad --vm-size shared-cpu-1x --volume-size 1 --initial-cluster-size 1
fly postgres attach uptime-arbiter-db --app uptime-arbiter-api
fly secrets set \
  REDIS_URL="..." \
  JWT_SIGNING_SECRET="$(openssl rand -hex 32)" \
  NEXT_PUBLIC_CONTRACT_ADDRESS="0x..." \
  GENLAYER_STUDIONET_RPC_URL="https://studio.genlayer.com/api" \
  GENLAYER_CHAIN_ID="61999" \
  GENLAYER_NETWORK_ALIAS="studionet" \
  CORS_ORIGINS="https://your-frontend.vercel.app" \
  --app uptime-arbiter-api
fly ips allocate-v4 --shared -a uptime-arbiter-api   # first deploy only —
fly ips allocate-v6 -a uptime-arbiter-api            # IP provisioning can fail silently otherwise
fly deploy --app uptime-arbiter-api
```

`fly.toml` runs two always-on process groups from one image — `api` (HTTP)
and `indexer` (background sync) — each with `min_machines_running = 1` so
Fly restarts them automatically if either crashes.

The Dockerfile installs `openssl`/`ca-certificates` explicitly in the base
stage — without it, Prisma's schema-engine binary fails on `node:20-slim`
with an opaque `Error: Schema engine error:` and no further detail. If
that error ever comes back, this is the first thing to check.

## Rate limiting

GenLayer StudioNet's real ceiling, confirmed live from an actual RPC error
response, is **500 requests/hour** — not a per-minute limit. (An earlier
version of this backend assumed 30/min, which sustained is ~1800/hour,
~3.6x over the real limit, and locked the indexer out entirely on first
real use — see `MEMORY.md` for the incident.) Every outbound RPC call this
service makes — indexer polling AND the live per-user balance relay route
— goes through `src/lib/rateLimiter.ts`, a Redis sliding **1-hour** window
capped at 420/hour (500 minus an 80-request safety margin). The indexer
polls every 60s with a budget of 6 calls/cycle (360/hour worst case),
leaving headroom under that cap for live API reads sharing the same
limiter.
