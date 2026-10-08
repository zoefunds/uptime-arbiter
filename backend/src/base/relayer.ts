import { createPublicClient, createWalletClient, http, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { config } from "../config.js";

const escrowAbi = [
  { type: "function", name: "agreements", stateMutability: "view", inputs: [{ type: "uint256", name: "" }], outputs: [{ type: "address", name: "provider" }, { type: "address", name: "customer" }, { type: "uint128", name: "escrowUsdc" }, { type: "uint128", name: "customerBondUsdc" }, { type: "uint128", name: "providerDeposited" }, { type: "uint128", name: "customerDeposited" }, { type: "uint64", name: "registrationDeadline" }, { type: "uint64", name: "termEnd" }, { type: "uint8", name: "status" }] },
  { type: "function", name: "relayAdjudication", stateMutability: "nonpayable", inputs: [{ type: "uint256", name: "agreementId" }, { type: "bytes32", name: "genlayerClaimId" }, { type: "uint128", name: "customerPayoutUsdc" }, { type: "uint128", name: "providerRefundUsdc" }, { type: "string", name: "verdict" }], outputs: [] },
] as const;

const account = privateKeyToAccount(config.base.relayerPrivateKey as `0x${string}`);
const publicClient = createPublicClient({ chain: baseSepolia, transport: http(config.base.rpcUrl) });
const walletClient = createWalletClient({ account, chain: baseSepolia, transport: http(config.base.rpcUrl) });
const escrow = config.base.escrowAddress as Address;

/**
 * Read the value that is actually locked in the Base escrow.  The GenLayer
 * contract intentionally never holds USDC, so this is the only truthful
 * source for registry funding amounts and protocol capital statistics.
 */
export async function readBaseAgreementFunding(baseAgreementId: string) {
  const agreement = await publicClient.readContract({
    address: escrow,
    abi: escrowAbi,
    functionName: "agreements",
    args: [BigInt(baseAgreementId)],
  });
  return {
    escrowUsdc: agreement[2],
    customerBondUsdc: agreement[3],
    providerDeposited: agreement[4],
    customerDeposited: agreement[5],
  };
}

/** Relay only a final GenLayer result. The Base contract independently
 * checks that payout + refund equals USDC held, preventing value creation. */
export async function relayResolvedClaim(args: { baseAgreementId: string; claimId: string; payoutUsdc: string; verdict: string }) {
  const agreement = await publicClient.readContract({ address: escrow, abi: escrowAbi, functionName: "agreements", args: [BigInt(args.baseAgreementId)] });
  const held = agreement[4] + agreement[5];
  const customerPayout = BigInt(args.payoutUsdc);
  if (customerPayout > held) throw new Error("GenLayer payout exceeds Base USDC held");
  const claimHash = (`0x${Buffer.from(args.claimId).toString("hex").padEnd(64, "0").slice(0, 64)}`) as `0x${string}`;
  const hash = await walletClient.writeContract({ address: escrow, abi: escrowAbi, functionName: "relayAdjudication", args: [BigInt(args.baseAgreementId), claimHash, customerPayout, held - customerPayout, args.verdict] });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}
