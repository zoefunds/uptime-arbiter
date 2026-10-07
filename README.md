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

After deployment set `NEXT_PUBLIC_BASE_ESCROW_ADDRESS` to the Base escrow address and retain the GenLayer adjudicator address separately.
