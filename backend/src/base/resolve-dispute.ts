import { createPublicClient, createWalletClient, http, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { config } from "../config.js";

/**
 * Deliberate human-operated finality step for a vetoed settlement.
 *
 * This command is not part of the indexer and it never derives a payout. An
 * operator must first independently review the finalized GenLayer ruling and
 * the frozen Base pending settlement. On-chain, it can re-authorize only that
 * already-frozen ruling; it cannot change its claim ID, digest, or economics.
 */
const abi = [
  { type: "function", name: "reauthorizeDisputedSettlement", stateMutability: "nonpayable", inputs: [{ type: "uint256", name: "agreementId" }], outputs: [] },
  { type: "function", name: "agreements", stateMutability: "view", inputs: [{ type: "uint256", name: "" }], outputs: [
    { type: "address", name: "provider" }, { type: "address", name: "customer" },
    { type: "uint128", name: "escrowUsdc" }, { type: "uint128", name: "customerBondUsdc" },
    { type: "uint128", name: "providerDeposited" }, { type: "uint128", name: "customerDeposited" },
    { type: "uint64", name: "registrationDeadline" }, { type: "uint64", name: "serviceEnd" },
    { type: "uint64", name: "claimDeadline" }, { type: "uint64", name: "settlementDeadline" },
    { type: "bool", name: "customerAccepted" }, { type: "bool", name: "claimOpen" },
    { type: "bytes32", name: "openClaimId" }, { type: "bytes32", name: "termsHash" }, { type: "uint8", name: "status" },
  ] },
] as const;

const rawAgreementId = process.argv[2] ?? "";
if (!/^\d+$/.test(rawAgreementId) || BigInt(rawAgreementId) === 0n) {
  throw new Error("Usage: npm run resolve-dispute -- <positive Base agreement ID>");
}
if (!config.base.disputeResolverPrivateKey) {
  throw new Error("BASE_DISPUTE_RESOLVER_PRIVATE_KEY is required only for this resolver command");
}

const agreementId = BigInt(rawAgreementId);
const account = privateKeyToAccount(config.base.disputeResolverPrivateKey as `0x${string}`);
const publicClient = createPublicClient({ chain: baseSepolia, transport: http(config.base.rpcUrl) });
const walletClient = createWalletClient({ account, chain: baseSepolia, transport: http(config.base.rpcUrl) });
const escrow = config.base.escrowAddress as Address;

const before = await publicClient.readContract({ address: escrow, abi, functionName: "agreements", args: [agreementId] });
if (before[14] !== 6) throw new Error(`Agreement ${agreementId} is not Disputed (status ${before[14]})`);

const hash = await walletClient.writeContract({ address: escrow, abi, functionName: "reauthorizeDisputedSettlement", args: [agreementId] });
const receipt = await publicClient.waitForTransactionReceipt({ hash });
if (receipt.status !== "success") throw new Error(`Dispute reauthorization reverted: ${hash}`);

const after = await publicClient.readContract({ address: escrow, abi, functionName: "agreements", args: [agreementId] });
if (after[14] !== 2) throw new Error(`Reauthorization receipt succeeded but status is ${after[14]}, not SettlementPending`);
console.log(JSON.stringify({ agreementId: agreementId.toString(), txHash: hash, status: "SETTLEMENT_PENDING" }));
