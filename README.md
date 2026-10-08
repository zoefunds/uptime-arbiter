# Uptime Arbiter

Uptime Arbiter resolves infrastructure SLA disputes with a split trust boundary.

- **Base Sepolia** holds and settles every value transfer as USDC, using the official testnet USDC contract `0x036CbD53842c5426634e7929541eC2318f3dCF7e` (6 decimals).
- **GenLayer** pins evidence and independently adjudicates breach minutes. It cannot custody or transfer tokens.
- The backend indexes verdicts and relays final settlement instructions to Base.

## Contracts

- `contracts/BaseUsdcEscrow.sol` is the sole custodian. Its settlement invariant requires the customer payout plus provider refund to equal all USDC held for an active agreement.
- `contracts/UptimeArbiter.py` is a non-custodial adjudicator. It emits a verdict, USDC payout amount, and payout basis points; it has no payable method.

## Flow

1. Provider proposes a Base escrow and both parties approve/fund USDC.
2. The evidence agreement is registered on GenLayer with the Base agreement ID.
3. Validators independently evaluate pinned public evidence.
4. The final verdict is relayed to Base and pays USDC directly to the parties.

## Local verification

```bash
forge build contracts/BaseUsdcEscrow.sol contracts/test/MockUSDC.sol
cd frontend && npx tsc --noEmit
cd backend && npm run build
```

## Live deployment

- Base Sepolia escrow: `0x5b15a8b6c7BD8C3fB104332A61dA2a5912290794`
- GenLayer StudioNet adjudicator: `0xcACB25F194b0821A74B3978B67acD7719c7E4F5C`
- Production app: https://uptime-arbiter.vercel.app
- API: https://uptime-arbiter-usdc-api.fly.dev/healthz

See `milestone.md` for the three real Base-to-GenLayer lifecycle records.
