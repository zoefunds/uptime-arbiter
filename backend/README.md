# Uptime Arbiter — Backend

Fastify API + background indexer, mirroring `contracts/UptimeArbiter.py`
(deployed at `0x6bd7064ECc72704D156FF5D34B2C7C3fEf9946c6` on GenLayer
StudioNet) into Postgres for fast reads. Never makes a business decision —
see the header comment in `prisma/schema.prisma` and `src/genlayer/client.ts`.

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

```bash
fly launch --no-deploy          # first time only, creates the app from fly.toml
fly postgres create             # provision Fly Postgres
fly postgres attach <pg-app-name>   # wires DATABASE_URL into secrets automatically
fly secrets set \
  REDIS_URL="..." \
  JWT_SIGNING_SECRET="$(openssl rand -hex 32)" \
  NEXT_PUBLIC_CONTRACT_ADDRESS="0x6bd7064ECc72704D156FF5D34B2C7C3fEf9946c6" \
  CORS_ORIGINS="https://your-frontend.vercel.app"
fly deploy
```

`fly.toml` runs two always-on process groups from one image — `api` (HTTP)
and `indexer` (background sync) — each with `min_machines_running = 1` so
Fly restarts them automatically if either crashes. `release_command` runs
`prisma migrate deploy` on every deploy, so schema changes ship safely.

## Rate limiting

GenLayer StudioNet enforces 30 requests/minute. Every outbound RPC call from
this service — indexer polling AND the live per-user balance relay route —
goes through `src/lib/rateLimiter.ts`, a Redis sliding-window limiter capped
at 24/min (30 minus a 6-request safety margin) so this backend can never be
the reason StudioNet starts throttling it.
