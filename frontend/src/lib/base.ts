import { createPublicClient, createWalletClient, custom, decodeEventLog, http, type Address } from "viem";
import { baseSepolia } from "viem/chains";

export const BASE_SEPOLIA_USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const;
const BASE_SEPOLIA_CHAIN_ID_HEX = "0x14a34";
// Deployed Base Sepolia escrow. An environment value permits a future
// redeployment without a source change.
export const BASE_ESCROW_ADDRESS = (process.env.NEXT_PUBLIC_BASE_ESCROW_ADDRESS ?? "0x9656B5a51E94C7bDE57c3370420d617F7Cc2bD98") as Address;

export const baseEscrowAbi = [
  { type: "function", name: "nextAgreementId", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "propose", stateMutability: "nonpayable", inputs: [{ name: "customer", type: "address" }, { name: "escrowUsdc", type: "uint128" }, { name: "customerBondUsdc", type: "uint128" }, { name: "registrationDeadline", type: "uint64" }, { name: "termEnd", type: "uint64" }], outputs: [{ name: "agreementId", type: "uint256" }] },
  { type: "function", name: "fundProvider", stateMutability: "nonpayable", inputs: [{ name: "agreementId", type: "uint256" }], outputs: [] },
  { type: "function", name: "fundCustomer", stateMutability: "nonpayable", inputs: [{ name: "agreementId", type: "uint256" }], outputs: [] },
  {
    type: "function", name: "agreements", stateMutability: "view", inputs: [{ name: "agreementId", type: "uint256" }],
    outputs: [
      { name: "provider", type: "address" }, { name: "customer", type: "address" },
      { name: "escrowUsdc", type: "uint128" }, { name: "customerBondUsdc", type: "uint128" },
      { name: "providerDeposited", type: "uint128" }, { name: "customerDeposited", type: "uint128" },
      { name: "registrationDeadline", type: "uint64" }, { name: "termEnd", type: "uint64" }, { name: "status", type: "uint8" },
    ],
  },
  {
    type: "event", name: "AgreementProposed", inputs: [
      { name: "agreementId", type: "uint256", indexed: true }, { name: "provider", type: "address", indexed: true },
      { name: "customer", type: "address", indexed: true }, { name: "escrowUsdc", type: "uint256", indexed: false },
      { name: "customerBondUsdc", type: "uint256", indexed: false }, { name: "registrationDeadline", type: "uint64", indexed: false },
      { name: "termEnd", type: "uint64", indexed: false },
    ],
  },
] as const;

const basePublicClient = createPublicClient({ chain: baseSepolia, transport: http() });

type Eip1193Provider = { request(args: { method: string; params?: unknown[] }): Promise<unknown> };

/**
 * Base asset writes must explicitly switch the same connected wallet to Base
 * Sepolia. A viem client configured with `baseSepolia` does not itself make a
 * wallet leave its currently selected chain.
 */
export async function ensureBaseSepolia(provider: unknown) {
  const wallet = provider as Eip1193Provider;
  if (!wallet?.request) throw new Error("Your connected wallet does not support Base Sepolia transactions");
  const chainId = async () => String(await wallet.request({ method: "eth_chainId" })).toLowerCase();
  if (await chainId() === BASE_SEPOLIA_CHAIN_ID_HEX) return;

  try {
    await wallet.request({ method: "wallet_switchEthereumChain", params: [{ chainId: BASE_SEPOLIA_CHAIN_ID_HEX }] });
  } catch {
    // Wallets differ in the error they return for an unknown network. Re-read
    // the actual selected chain, then add Base Sepolia when needed.
  }
  if (await chainId() === BASE_SEPOLIA_CHAIN_ID_HEX) return;

  await wallet.request({
    method: "wallet_addEthereumChain",
    params: [{
      chainId: BASE_SEPOLIA_CHAIN_ID_HEX,
      chainName: "Base Sepolia",
      nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: ["https://sepolia.base.org"],
      blockExplorerUrls: ["https://sepolia.basescan.org"],
    }],
  });
  await wallet.request({ method: "wallet_switchEthereumChain", params: [{ chainId: BASE_SEPOLIA_CHAIN_ID_HEX }] });
  if (await chainId() !== BASE_SEPOLIA_CHAIN_ID_HEX) throw new Error("Please switch your wallet to Base Sepolia to continue");
}

/**
 * Network changes can leave AppKit/wagmi displaying one account while an
 * injected provider has another selected. Re-read the provider immediately
 * before a Base signature so approvals and deposits cannot be signed by an
 * unintended account.
 */
export async function assertBaseSigningAccount(provider: unknown, expected: Address) {
  const wallet = provider as Eip1193Provider;
  await ensureBaseSepolia(wallet);
  const accounts = await wallet.request({ method: "eth_accounts" }) as string[];
  if (!accounts.some((account) => account.toLowerCase() === expected.toLowerCase())) {
    throw new Error(`Wallet account changed. Reconnect the SLA wallet (${expected}) and try again.`);
  }
}

export async function nextBaseAgreementId() {
  if (!BASE_ESCROW_ADDRESS) throw new Error("Base escrow is not configured");
  return basePublicClient.readContract({ address: BASE_ESCROW_ADDRESS, abi: baseEscrowAbi, functionName: "nextAgreementId" });
}

export async function waitForBaseReceipt(hash: `0x${string}`) {
  const receipt = await basePublicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`Base Sepolia transaction reverted: ${hash}`);
  return receipt;
}

/**
 * Never predict an agreement number client-side. The proposal receipt is the
 * canonical association between this wallet action and an escrow agreement.
 */
export function agreementIdFromProposalReceipt(receipt: Awaited<ReturnType<typeof waitForBaseReceipt>>): bigint {
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({ abi: baseEscrowAbi, data: log.data, topics: log.topics });
      if (decoded.eventName === "AgreementProposed" && decoded.args.agreementId !== undefined) {
        return decoded.args.agreementId;
      }
    } catch {
      // A receipt has logs from USDC and possibly other contracts; only the
      // escrow's AgreementProposed event is relevant here.
    }
  }
  throw new Error("The Base proposal confirmed without an AgreementProposed event");
}

type BaseAgreement = {
  provider: Address; customer: Address; escrowUsdc: bigint; customerBondUsdc: bigint;
  providerDeposited: bigint; customerDeposited: bigint; registrationDeadline: bigint; termEnd: bigint; status: number;
};

export async function readBaseAgreement(agreementId: bigint): Promise<BaseAgreement> {
  const agreement = await basePublicClient.readContract({
    address: BASE_ESCROW_ADDRESS, abi: baseEscrowAbi, functionName: "agreements", args: [agreementId],
  });
  const [provider, customer, escrowUsdc, customerBondUsdc, providerDeposited, customerDeposited, registrationDeadline, termEnd, status] = agreement;
  return { provider, customer, escrowUsdc, customerBondUsdc, providerDeposited, customerDeposited, registrationDeadline, termEnd, status };
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Base RPC/indexing can lag just after a mined receipt. Retry the read-back. */
export async function confirmBaseFunding(args: {
  agreementId: bigint; provider: Address; customer: Address; escrowUsdc: bigint; customerBondUsdc: bigint; party: "provider" | "customer";
}) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const a = await readBaseAgreement(args.agreementId);
    const termsMatch = a.provider.toLowerCase() === args.provider.toLowerCase()
      && a.customer.toLowerCase() === args.customer.toLowerCase()
      && a.escrowUsdc === args.escrowUsdc && a.customerBondUsdc === args.customerBondUsdc;
    const funded = args.party === "provider" ? a.providerDeposited === args.escrowUsdc : a.customerDeposited === args.customerBondUsdc;
    if (termsMatch && funded) return a;
    await pause(1_250);
  }
  throw new Error("Base receipt was mined but the escrow state did not confirm. Do not repeat the payment; refresh and check the Base transaction.");
}

export const usdcAbi = [
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

export async function baseUsdcBalance(account: Address) {
  return basePublicClient.readContract({ address: BASE_SEPOLIA_USDC, abi: usdcAbi, functionName: "balanceOf", args: [account] });
}

/** User-signed Base Sepolia transaction; USDC never transits GenLayer. */
export async function writeBaseContract(
  provider: unknown, account: Address, address: Address,
  abi: typeof baseEscrowAbi | typeof usdcAbi, functionName: string, args: readonly unknown[],
) {
  if (!BASE_ESCROW_ADDRESS) throw new Error("Base escrow is not configured");
  const client = createWalletClient({ account, chain: baseSepolia, transport: custom(provider as Parameters<typeof custom>[0]) });
  return client.writeContract({ address, abi, functionName: functionName as never, args: args as never });
}
