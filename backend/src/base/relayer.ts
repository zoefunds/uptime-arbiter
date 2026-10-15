import { createPublicClient, createWalletClient, http, keccak256, stringToBytes, type Address, type Hash } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { config } from "../config.js";

const agreementOutputs = [
  { type: "address", name: "provider" }, { type: "address", name: "customer" },
  { type: "uint128", name: "escrowUsdc" }, { type: "uint128", name: "customerBondUsdc" },
  { type: "uint128", name: "providerDeposited" }, { type: "uint128", name: "customerDeposited" },
  { type: "uint64", name: "registrationDeadline" }, { type: "uint64", name: "serviceEnd" },
  { type: "uint64", name: "claimDeadline" }, { type: "uint64", name: "settlementDeadline" },
  { type: "bool", name: "customerAccepted" }, { type: "bool", name: "claimOpen" },
  { type: "bytes32", name: "openClaimId" }, { type: "bytes32", name: "termsHash" },
  { type: "uint8", name: "status" },
] as const;

const escrowAbi = [
  { type: "function", name: "agreements", stateMutability: "view", inputs: [{ type: "uint256", name: "" }], outputs: agreementOutputs },
  { type: "function", name: "pendingSettlements", stateMutability: "view", inputs: [{ type: "uint256", name: "" }], outputs: [
    { type: "bytes32", name: "claimId" }, { type: "bytes32", name: "rulingHash" },
    { type: "uint128", name: "customerPayoutUsdc" }, { type: "uint128", name: "providerRefundUsdc" },
    { type: "uint64", name: "executeAfter" }, { type: "bool", name: "vetoed" },
  ] },
  { type: "function", name: "proposeAdjudication", stateMutability: "nonpayable", inputs: [
    { type: "uint256", name: "agreementId" }, { type: "bytes32", name: "claimId" },
    { type: "bytes32", name: "rulingHash" }, { type: "uint128", name: "customerPayoutUsdc" },
    { type: "uint128", name: "providerRefundUsdc" },
  ], outputs: [] },
  { type: "function", name: "executeSettlement", stateMutability: "nonpayable", inputs: [{ type: "uint256", name: "agreementId" }], outputs: [] },
  { type: "function", name: "consumedClaims", stateMutability: "view", inputs: [{ type: "bytes32", name: "" }], outputs: [{ type: "bool", name: "" }] },
  { type: "function", name: "disputedClaims", stateMutability: "view", inputs: [{ type: "bytes32", name: "" }], outputs: [{ type: "bool", name: "" }] },
] as const;

const account = privateKeyToAccount(config.base.relayerPrivateKey as `0x${string}`);
const publicClient = createPublicClient({ chain: baseSepolia, transport: http(config.base.rpcUrl) });
const walletClient = createWalletClient({ account, chain: baseSepolia, transport: http(config.base.rpcUrl) });
const escrow = config.base.escrowAddress as Address;

export type BaseAgreement = Awaited<ReturnType<typeof readBaseAgreement>>;

export function claimIdToBytes32(claimId: string): Hash {
  return keccak256(stringToBytes(claimId));
}

async function successfulReceipt(hash: Hash, action: string) {
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${action} reverted on Base Sepolia: ${hash}`);
  return receipt;
}

export async function readBaseAgreement(baseAgreementId: string) {
  const a = await publicClient.readContract({
    address: escrow, abi: escrowAbi, functionName: "agreements", args: [BigInt(baseAgreementId)],
  });
  return {
    provider: a[0], customer: a[1], escrowUsdc: a[2], customerBondUsdc: a[3],
    providerDeposited: a[4], customerDeposited: a[5], registrationDeadline: a[6],
    serviceEnd: a[7], claimDeadline: a[8], settlementDeadline: a[9],
    customerAccepted: a[10], claimOpen: a[11], openClaimId: a[12], termsHash: a[13], status: a[14],
  };
}

export async function readBaseAgreementFunding(baseAgreementId: string) {
  const a = await readBaseAgreement(baseAgreementId);
  return {
    escrowUsdc: a.escrowUsdc,
    customerBondUsdc: a.customerBondUsdc,
    providerDeposited: a.providerDeposited,
    customerDeposited: a.customerDeposited,
  };
}

export async function readPendingSettlement(baseAgreementId: string) {
  const p = await publicClient.readContract({
    address: escrow, abi: escrowAbi, functionName: "pendingSettlements", args: [BigInt(baseAgreementId)],
  });
  return { claimId: p[0], rulingHash: p[1], customerPayoutUsdc: p[2], providerRefundUsdc: p[3], executeAfter: p[4], vetoed: p[5] };
}

export function assertBoundAgreement(args: {
  agreement: BaseAgreement;
  provider: string;
  customer: string;
  maxPayoutUsdc: string;
  customerBondUsdc: string;
  serviceEnd: string;
  claimDeadline: string;
  settlementDeadline: string;
  termsHash: string;
}) {
  const a = args.agreement;
  const mismatches: string[] = [];
  if (a.provider.toLowerCase() !== args.provider.toLowerCase()) mismatches.push("provider");
  if (a.customer.toLowerCase() !== args.customer.toLowerCase()) mismatches.push("customer");
  if (a.escrowUsdc !== BigInt(args.maxPayoutUsdc)) mismatches.push("provider escrow");
  if (a.customerBondUsdc !== BigInt(args.customerBondUsdc)) mismatches.push("customer bond");
  if (a.serviceEnd !== BigInt(args.serviceEnd)) mismatches.push("service end");
  if (a.claimDeadline !== BigInt(args.claimDeadline)) mismatches.push("claim deadline");
  if (a.settlementDeadline !== BigInt(args.settlementDeadline)) mismatches.push("settlement deadline");
  if (a.termsHash.toLowerCase() !== args.termsHash.toLowerCase()) mismatches.push("terms commitment");
  if (mismatches.length) throw new Error(`GenLayer/Base binding mismatch: ${mismatches.join(", ")}`);
}

export async function proposeResolvedClaim(args: {
  baseAgreementId: string;
  claimId: string;
  evidenceDigest: string;
  penaltyPayoutUsdc: string;
  provider: string;
  customer: string;
  maxPayoutUsdc: string;
  customerBondUsdc: string;
  serviceEnd: string;
  claimDeadline: string;
  settlementDeadline: string;
  termsHash: string;
}) {
  const agreement = await readBaseAgreement(args.baseAgreementId);
  assertBoundAgreement({ agreement, ...args });
  const claimHash = claimIdToBytes32(args.claimId);
  if (!agreement.claimOpen || agreement.openClaimId.toLowerCase() !== claimHash.toLowerCase()) {
    throw new Error("Base escrow does not contain the matching open claim");
  }
  const penalty = BigInt(args.penaltyPayoutUsdc);
  if (penalty > agreement.providerDeposited) throw new Error("GenLayer penalty exceeds provider escrow");
  // Customer bond is returned to the customer; the adjudicated penalty comes
  // only from provider escrow. This preserves each financial term exactly.
  const customerPayout = agreement.customerDeposited + penalty;
  const providerRefund = agreement.providerDeposited - penalty;
  const rulingHash = args.evidenceDigest as Hash;
  if (!/^0x[0-9a-fA-F]{64}$/.test(rulingHash)) throw new Error("Finalized ruling has no valid evidence digest");
  const hash = await walletClient.writeContract({
    address: escrow,
    abi: escrowAbi,
    functionName: "proposeAdjudication",
    args: [BigInt(args.baseAgreementId), claimHash, rulingHash, customerPayout, providerRefund],
  });
  await successfulReceipt(hash, "proposeAdjudication");
  return hash;
}

export async function executeResolvedClaim(baseAgreementId: string) {
  const pending = await readPendingSettlement(baseAgreementId);
  if (pending.vetoed || pending.claimId === `0x${"0".repeat(64)}`) throw new Error("No executable settlement proposal");
  if (BigInt(Math.floor(Date.now() / 1000)) < pending.executeAfter) return null;
  const hash = await walletClient.writeContract({
    address: escrow, abi: escrowAbi, functionName: "executeSettlement", args: [BigInt(baseAgreementId)],
  });
  await successfulReceipt(hash, "executeSettlement");
  const agreement = await readBaseAgreement(baseAgreementId);
  if (agreement.status !== 3) throw new Error("Base receipt succeeded but agreement is not Settled");
  return hash;
}

export async function reconcileResolvedClaim(args: Parameters<typeof proposeResolvedClaim>[0]) {
  const agreement = await readBaseAgreement(args.baseAgreementId);
  assertBoundAgreement({ agreement, ...args });
  if (agreement.status === 3) {
    const claimHash = claimIdToBytes32(args.claimId);
    const consumed = await publicClient.readContract({
      address: escrow, abi: escrowAbi, functionName: "consumedClaims", args: [claimHash],
    });
    if (!consumed) throw new Error("Settled Base agreement did not consume this finalized GenLayer claim");
    return { status: "EXECUTED" as const, txHash: null };
  }
  if (agreement.status === 2) {
    const pending = await readPendingSettlement(args.baseAgreementId);
    if (pending.claimId.toLowerCase() !== claimIdToBytes32(args.claimId).toLowerCase()
      || pending.rulingHash.toLowerCase() !== args.evidenceDigest.toLowerCase()) {
      throw new Error("Existing Base settlement proposal does not match finalized GenLayer ruling");
    }
    const txHash = await executeResolvedClaim(args.baseAgreementId);
    return txHash ? { status: "EXECUTED" as const, txHash } : { status: "TIMELOCK" as const, txHash: null };
  }
  if (agreement.status === 6) {
    const disputed = await publicClient.readContract({
      address: escrow, abi: escrowAbi, functionName: "disputedClaims", args: [claimIdToBytes32(args.claimId)],
    });
    if (disputed) throw new Error("The SLA parties vetoed this claim's settlement proposal; it is frozen for independent resolver review and cannot be reproposed by the relayer.");
    throw new Error("Base agreement is disputed and cannot accept a new relay proposal");
  }
  if (agreement.status !== 1) throw new Error(`Base agreement is not active (status ${agreement.status})`);
  const txHash = await proposeResolvedClaim(args);
  return { status: "PROPOSED" as const, txHash };
}
