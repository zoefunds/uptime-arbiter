import { createPublicClient, createWalletClient, http, type Address, type Hash } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { config } from "../config.js";
import { contract } from "../genlayer/client.js";
import { claimIdToBytes32 } from "./relayer.js";

/**
 * Human-operated, two-key dispute resolution.
 *
 * No payout or digest is accepted from CLI input. This command independently
 * reads the finalized GenLayer claim and its SLA binding, derives the Base USDC
 * distribution, has the distinct verifier attest it on Base, then has the
 * distinct resolver apply only that on-chain attestation.
 */
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

const abi = [
  { type: "function", name: "agreements", stateMutability: "view", inputs: [{ type: "uint256", name: "" }], outputs: agreementOutputs },
  { type: "function", name: "attestDisputeRuling", stateMutability: "nonpayable", inputs: [
    { type: "uint256", name: "agreementId" }, { type: "bytes32", name: "claimId" },
    { type: "bytes32", name: "rulingHash" }, { type: "uint128", name: "customerPayoutUsdc" },
    { type: "uint128", name: "providerRefundUsdc" },
  ], outputs: [] },
  { type: "function", name: "resolveDisputedSettlement", stateMutability: "nonpayable", inputs: [{ type: "uint256", name: "agreementId" }], outputs: [] },
] as const;

function text(value: unknown): string { return value === undefined || value === null ? "" : String(value); }

const rawAgreementId = process.argv[2] ?? "";
const claimId = process.argv[3] ?? "";
if (!/^\d+$/.test(rawAgreementId) || BigInt(rawAgreementId) === 0n || !/^CLM-\d+$/.test(claimId)) {
  throw new Error("Usage: npm run resolve-dispute -- <positive Base agreement ID> <GenLayer claim ID>");
}
if (!config.base.disputeResolverPrivateKey || !config.base.rulingVerifierPrivateKey) {
  throw new Error("BASE_DISPUTE_RESOLVER_PRIVATE_KEY and BASE_RULING_VERIFIER_PRIVATE_KEY are required");
}

const agreementId = BigInt(rawAgreementId);
const resolver = privateKeyToAccount(config.base.disputeResolverPrivateKey as `0x${string}`);
const verifier = privateKeyToAccount(config.base.rulingVerifierPrivateKey as `0x${string}`);
if (resolver.address.toLowerCase() === verifier.address.toLowerCase()) throw new Error("Resolver and verifier wallets must be different");

const publicClient = createPublicClient({ chain: baseSepolia, transport: http(config.base.rpcUrl) });
const resolverClient = createWalletClient({ account: resolver, chain: baseSepolia, transport: http(config.base.rpcUrl) });
const verifierClient = createWalletClient({ account: verifier, chain: baseSepolia, transport: http(config.base.rpcUrl) });
const escrow = config.base.escrowAddress as Address;

const claim = await contract.getClaim(claimId);
if (!text(claim.status).startsWith("FINALIZED_")) throw new Error(`GenLayer claim ${claimId} is not finalized`);
const digest = text(claim.evidence_digest) as Hash;
if (!/^0x[0-9a-fA-F]{64}$/.test(digest)) throw new Error("Finalized GenLayer claim has no valid evidence digest");
const sla = await contract.getSla(text(claim.sla_id));
if (text(sla.base_agreement_id) !== rawAgreementId) throw new Error("GenLayer claim is bound to a different Base agreement");

const agreement = await publicClient.readContract({ address: escrow, abi, functionName: "agreements", args: [agreementId] });
if (agreement[14] !== 6) throw new Error(`Agreement ${agreementId} is not Disputed (status ${agreement[14]})`);
const claimHash = claimIdToBytes32(claimId);
if (agreement[12].toLowerCase() !== claimHash.toLowerCase()) throw new Error("Base open claim does not match finalized GenLayer claim");
if (agreement[0].toLowerCase() !== text(sla.provider).toLowerCase()
  || agreement[1].toLowerCase() !== text(sla.customer).toLowerCase()
  || agreement[13].toLowerCase() !== text(sla.base_terms_hash).toLowerCase()) {
  throw new Error("GenLayer/Base participants or terms commitment do not match");
}

const penalty = BigInt(text(claim.payout_usdc));
if (penalty > agreement[4]) throw new Error("Finalized GenLayer penalty exceeds provider deposit");
const customerPayout = agreement[5] + penalty;
const providerRefund = agreement[4] - penalty;

const attestationHash = await verifierClient.writeContract({
  address: escrow, abi, functionName: "attestDisputeRuling",
  args: [agreementId, claimHash, digest, customerPayout, providerRefund],
});
const attestationReceipt = await publicClient.waitForTransactionReceipt({ hash: attestationHash });
if (attestationReceipt.status !== "success") throw new Error(`Verifier attestation reverted: ${attestationHash}`);

const resolutionHash = await resolverClient.writeContract({ address: escrow, abi, functionName: "resolveDisputedSettlement", args: [agreementId] });
const resolutionReceipt = await publicClient.waitForTransactionReceipt({ hash: resolutionHash });
if (resolutionReceipt.status !== "success") throw new Error(`Dispute resolution reverted: ${resolutionHash}`);

const after = await publicClient.readContract({ address: escrow, abi, functionName: "agreements", args: [agreementId] });
if (after[14] !== 2) throw new Error(`Resolution receipt succeeded but status is ${after[14]}, not SettlementPending`);
console.log(JSON.stringify({
  agreementId: agreementId.toString(), claimId, rulingHash: digest,
  customerPayoutUsdc: customerPayout.toString(), providerRefundUsdc: providerRefund.toString(),
  verifierAttestationTx: attestationHash, resolverTx: resolutionHash, status: "SETTLEMENT_PENDING",
}));
