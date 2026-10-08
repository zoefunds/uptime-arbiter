# Uptime Arbiter backend

The backend is a Fastify API, GenLayer indexer, and narrowly-scoped Base
settlement relay. It is not an SLA decision-maker and never accepts or
custodies user USDC. Base Sepolia's escrow contract is the only asset layer.

## Production deployment

| Resource | Value |
| --- | --- |
| Fly app | `uptime-arbiter-usdc-api` |
| Fly Postgres | `uptime-arbiter-usdc-db` |
| API | `https://uptime-arbiter-usdc-api.fly.dev` |
| Runtime process groups | API and indexer, deployed together from the same image |
| Final GenLayer contract | `0x1798573a1C99b5250881666999d8C3486E5cA4f1` |
| Base escrow | `0x9656B5a51E94C7bDE57c3370420d617F7Cc2bD98` |

`fly.toml` runs two always-on process groups from the same image:

- `api` runs `node dist/server.js`; `/healthz` checks Postgres and Redis.
- `indexer` runs `node dist/indexer/poll.js`; it survives individual GenLayer
  failures and retries on a later cycle.

## Trust and data model

Postgres is a denormalized read cache, not protocol authority. `SlaAgreement`,
`Claim`, and `Challenge` rows are written from GenLayer view methods by the
indexer; ordinary API routes only read those rows. GenLayer state is the source
of truth for SLA terms and verdicts. Base state is the source of truth for
USDC deposits and settlement.

The only intentional post-write exceptions are `POST /slas/confirm-registration`
and `POST /slas/:slaId/confirm-funding`.
After a user has signed Base proposal/approval/funding and the GenLayer
registration transaction, the endpoint performs a bounded direct read-back.
It requires the same Base agreement ID, provider address, and provider funding
receipt before returning the real SLA ID and mirroring it into Postgres. A
timeout or missing match returns HTTP 409 and explicitly tells the client not
to make another payment.

`confirm-funding` applies the same safety rule to provider escrow and customer
bond funding. It accepts the already-mined Base transaction hash plus the
funding role, waits for the receipt to appear in GenLayer's persisted SLA
record, then refreshes that SLA's cache row before returning `PROPOSED` or
`ACTIVE`. Neither endpoint sends an on-chain transaction or decides an SLA;
they only prove that a user-signed cross-chain write has already persisted.

`GET /protocol/stats` is a live Postgres aggregate over the mirrored state. It
returns registered/active SLA counts, claim and challenge counts, and the sum
of provider plus customer deposits for active Base agreements. Monetary values
are kept in six-decimal USDC base units as strings. During indexing,
`readBaseAgreementFunding` reads `BaseUsdcEscrow.agreements(id)` so those
amounts come from Base Sepolia, never from a GenLayer estimate.

When GenLayer resolves a claim, the relayer submits the result to Base. The
Base contract independently enforces that customer payout plus provider refund
equals exactly the USDC held by that agreement; the backend cannot mint or
overpay funds.

## Local development

```bash
npm install
npx prisma migrate dev
npm run dev       # Fastify on :8080
npm run indexer   # separate terminal
```

Required environment values are documented in `.env.example`. In addition to
Postgres and Redis, use the final GenLayer contract address, a Base Sepolia RPC
URL, the Base escrow address, and the relayer key only in backend secrets.
Never expose the relayer key through the frontend.

## Deploying

From `backend/`:

```bash
npm run build
fly deploy
```

The Fly release command runs `prisma migrate deploy`. Contract migrations are
not routine configuration changes: if `NEXT_PUBLIC_CONTRACT_ADDRESS` is changed,
the cache must be cleared first because contract-local IDs such as `SLA-1` can
overlap an earlier deployment.

```bash
fly secrets set NEXT_PUBLIC_CONTRACT_ADDRESS="<new GenLayer address>" -a uptime-arbiter-usdc-api
fly postgres connect -a uptime-arbiter-usdc-db --database uptime_arbiter_usdc
# TRUNCATE TABLE "SlaAgreement", "Claim", "Challenge";
# UPDATE "IndexerCursor" SET "slaOffset"=0, "claimOffset"=0, "lastRunAt"=NULL, "lastError"=NULL, "consecutiveErrors"=0 WHERE id='default';
```

Restart/redeploy the API and indexer after changing the contract secret. Do not
delete on-chain agreements: database cleanup only clears the non-authoritative
mirror.

## GenLayer RPC budget

StudioNet has a practical ceiling of 500 requests/hour. The shared Redis
sliding-window limiter reserves an 80-request margin and caps ordinary backend
reads at 420/hour. The indexer runs every 180 seconds with a six-call cycle
budget (120 calls/hour worst case), leaving room for API reads. The bounded
post-write confirmation route is deliberately outside that background queue so
it can give a payment-safety answer promptly rather than waiting behind cache
work.
