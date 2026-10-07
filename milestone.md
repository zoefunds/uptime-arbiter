# Base Sepolia USDC milestone

## Delivered architecture

All escrow and settlement now belongs to Base Sepolia USDC (`0x036CbD53842c5426634e7929541eC2318f3dCF7e`, 6 decimals). GenLayer has been reduced to evidence adjudication: it cannot receive native value, hold a token balance, or transfer tokens.

`BaseUsdcEscrow` was deployed to Base Sepolia at `0xf19027e7EA05165A44336F5A2c53f7A09B26a0F3` in transaction `0x30e32c824a775d230fef1baafcc5a4dcb5d0511d5e80506e461fe4947bcdcddb`. Its relayer is the deployment wallet `0x7401c129EDfc26E68FE19309fE461eb3Db1058Eb`.

The paired GenLayer adjudicator was deployed and accepted at `0xC9f0fC17f29D7F4521dBef942CBE9481dB839d0D` in transaction `0xf20e2a1e6e2e12b7c273045a275dc730f89148cce71aca200833f2d9f9914426`.

The escrow contract requires explicit USDC approval and exact funding by each party. A relayed decision can settle only an active agreement, and customer payout plus provider refund must exactly equal the USDC held. This prevents the relayer from minting a payout through a malformed decision. Cancellation and expiry refund the original funders.

## Frontend and backend

- Base Sepolia is the wallet network offered by the frontend.
- USDC formatting and six-decimal input conversion replaced the prior token denomination helpers.
- The registration autofill uses valid public GitHub, OpenAI, and AWS status endpoints, a valid EVM customer address, valid term timestamps, and six-decimal USDC amounts accepted by `BaseUsdcEscrow.propose`.
- The former GenLayer withdrawal screen now accurately explains direct Base USDC settlement.
- The backend client is read-only for GenLayer adjudication; its indexer maps adjudicator output as USDC units and no longer calls legacy custody views.

## Verification

- `forge build contracts/BaseUsdcEscrow.sol contracts/test/MockUSDC.sol` passed (timestamp lint warnings are expected for deadline checks).
- `frontend: npx tsc --noEmit` passed.
- `backend: npm run build` passed.
- `genvm-lint` static rules passed. Its local semantic SDK-resource lookup was unavailable, but StudioNet accepted the deployed contract with unanimous validator agreement.

## Follow-up required before production

1. Configure the backend relayer key and Base contract address, then run Base Sepolia lifecycle tests with funded test accounts.
2. Replace the temporary legacy-named database columns with a migration using `*Usdc` names before public release.
