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
| GenLayer v0.9 contract | `0x73EC2602e25e24FCF642C80642b8541095427Fc4` |
| Base v0.7 escrow | `0x8025E0Edd8BF6D27322A07699EB237F7248Dea6A` |

The production `/healthz` response was rechecked after the v0.9/v0.7 deployment on 2026-10-15 and reported both database and Redis checks as healthy. Contract-index rows are cleared before an address switch; the indexer begins at offset zero for the new contract, while auth/session data remains intact.

The prior v0.8/v0.5 production indexer completed a challenged-breach relay on 2026-10-15. It
recorded `FINALIZED_BREACH` with a one-challenge history, submitted
[the delayed Base proposal](https://sepolia.basescan.org/tx/0xb10f8e0e4c40e4834ae8196f1914abd44d0982149b995387e813c4984e0ace2d),
and recorded `EXECUTED` only after [the Base execution receipt](https://sepolia.basescan.org/tx/0x796ea0a1398772f6b4cd15cf34c7904b522c8a9345b13afc63ba43a8fd54ac8b)
succeeded and the escrow read-back reported `Settled`.

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

When GenLayer finalizes a claim, the relay authenticates the Base/GenLayer
binding: provider, customer, escrow, bond, service end, claim deadline,
settlement deadline, and terms hash must all match. It derives the distribution
from the recorded bond and finalized penalty, checks the matching Base claim
lock, and submits only a delayed proposal. Either party can veto during the
ten-minute delay. Execution is recorded only when the Base receipt succeeds
and a read-back reports `Settled`; a mined revert stays unpaid/recoverable.

The indexer treats Base as lifecycle authority. Active, settlement-pending,
disputed, settled, cancelled, and expired states are read from escrow rather than inferred
from historical GenLayer funding acknowledgments, so a refunded agreement
cannot remain displayed as active.

Historical `providerDeposited` and `customerDeposited` struct fields are immutable
receipt evidence and are not equivalent to the escrow's current distributable
balance after settlement. Consumers must use the Base lifecycle status together
with pending-settlement, disputed-claim, and claim-consumption reads. A
`Disputed` claim is never reproposed by the relay and cannot be refunded as its
original deposits. After the contract's 24-hour review delay, only the separately
configured resolver can re-authorize the already frozen claim and distribution.
That reauthorization is final for the frozen claim, so it cannot be vetoed in
an endless loop. The Base execution receipt—not a local
transaction-string field—is the authoritative payment proof.

The resolver is intentionally not an HTTP endpoint and is never invoked by the
indexer. After independently reviewing the finalized GenLayer ruling and the
frozen Base settlement, an authorized operator may run the receipt-checked,
single-purpose command below. It can re-authorize only the existing frozen
ruling; it cannot create a new payout or modify any amount.

```bash
npm run resolve-dispute -- <base-agreement-id>
```

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
