# Base Sepolia USDC milestone

## Delivered architecture

All escrow and settlement now belongs to Base Sepolia USDC (`0x036CbD53842c5426634e7929541eC2318f3dCF7e`, 6 decimals). GenLayer has been reduced to evidence adjudication: it cannot receive native value, hold a token balance, or transfer tokens.

`BaseUsdcEscrow` was deployed to Base Sepolia at `0xf19027e7EA05165A44336F5A2c53f7A09B26a0F3` in transaction `0x30e32c824a775d230fef1baafcc5a4dcb5d0511d5e80506e461fe4947bcdcddb`. Its relayer is the deployment wallet `0x7401c129EDfc26E68FE19309fE461eb3Db1058Eb`.

The active paired GenLayer adjudicator was deployed and accepted unanimously at `0x9FE0d15132993eCC93C5D665be331D48Fb60532a` in transaction `0x2685b4e47760d8e2ba2406347fb449b8499f50c2daffaaeb2fc185f3ace385d3`.

The escrow contract requires explicit USDC approval and exact funding by each party. A relayed decision can settle only an active agreement, and customer payout plus provider refund must exactly equal the USDC held. This prevents the relayer from minting a payout through a malformed decision. Cancellation and expiry refund the original funders.

## Frontend and backend

- Base Sepolia is the wallet network offered by the frontend.
- USDC formatting and six-decimal input conversion replaced the prior token denomination helpers.
- The registration autofill uses valid public GitHub, OpenAI, and AWS status endpoints, a valid EVM customer address, valid term timestamps, and six-decimal USDC amounts accepted by `BaseUsdcEscrow.propose`.
- The former GenLayer withdrawal screen now accurately explains direct Base USDC settlement.
- The backend client is read-only for GenLayer adjudication; its indexer maps adjudicator output as USDC units and no longer calls legacy custody views.
- A dedicated relayer uses the Base Sepolia deployment account only after a terminal GenLayer verdict. It reads the Base agreement, rejects a payout above the USDC held, and submits `relayAdjudication`. Its database finalization marker makes that relay idempotent across indexer polling cycles.
- The previous Fly deployment was not reused. A clean PostgreSQL database, `uptime_arbiter_usdc`, is attached to the new Fly application `uptime-arbiter-usdc-api`; no prior SLA data was copied, migrated, or left addressable. The public API is live at `https://uptime-arbiter-usdc-api.fly.dev/healthz`.
- Production frontend configuration now targets the new GenLayer contract, the Base escrow, and that Fly API. The deployed UI includes `/verification`, which displays the executed E2E test record rather than seeded/placeholder SLA data.
- Each funding action is now paired: the wallet first confirms the USDC transfer on Base Sepolia, then the same provider/customer records that immutable Base receipt hash on GenLayer. This is an audit acknowledgement only; GenLayer cannot custody or transfer USDC.

## Verification

- `forge test -vvv` passed: three explicit lifecycle tests execute the production escrow bytecode with a local ERC-20 installed at the canonical Base Sepolia USDC address. They assert partial breach settlement, no-breach full provider settlement, and term-expiry refunds with exact six-decimal USDC balances.
- `frontend: npx tsc --noEmit` passed.
- `backend: npm run build` passed.
- `genvm-lint` static rules passed. Its local semantic SDK-resource lookup was unavailable, but StudioNet accepted the deployed contract with unanimous validator agreement.

## Deployment record

- Fly application: `uptime-arbiter-usdc-api` (new authenticated Fly account, public shared IPv4 `66.241.125.252`).
- Vercel project: `uptime-arbiter`; production configuration includes `NEXT_PUBLIC_CONTRACT_ADDRESS`, `NEXT_PUBLIC_BASE_ESCROW_ADDRESS`, and `NEXT_PUBLIC_API_BASE_URL` for this milestone.
- Source change comparison: [baseline to milestone](https://github.com/zoefunds/uptime-arbiter/compare/9c45aaf364e0e942b7e3beb2fc16afe8dc836cd2...main).

## Operational note

The executed E2E tests are intentionally local-EVM contract tests, not fabricated Base Sepolia activity. They prove the complete USDC transfer and state-transition paths deterministically. Public testnet lifecycle runs additionally require two funded Base Sepolia test accounts holding faucet USDC; the deployed contract and frontend already enforce that same approval and funding flow.
