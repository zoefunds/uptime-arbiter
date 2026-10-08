import { createPublicClient, createWalletClient, custom, http, type Address } from "viem";
import { baseSepolia } from "viem/chains";

export const BASE_SEPOLIA_USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const;
const BASE_SEPOLIA_CHAIN_ID_HEX = "0x14a34";
// Deployed Base Sepolia escrow. An environment value permits a future
// redeployment without a source change.
export const BASE_ESCROW_ADDRESS = (process.env.NEXT_PUBLIC_BASE_ESCROW_ADDRESS ?? "0x5b15a8b6c7BD8C3fB104332A61dA2a5912290794") as Address;

export const baseEscrowAbi = [
  { type: "function", name: "nextAgreementId", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "propose", stateMutability: "nonpayable", inputs: [{ name: "customer", type: "address" }, { name: "escrowUsdc", type: "uint128" }, { name: "customerBondUsdc", type: "uint128" }, { name: "registrationDeadline", type: "uint64" }, { name: "termEnd", type: "uint64" }], outputs: [{ name: "agreementId", type: "uint256" }] },
  { type: "function", name: "fundProvider", stateMutability: "nonpayable", inputs: [{ name: "agreementId", type: "uint256" }], outputs: [] },
  { type: "function", name: "fundCustomer", stateMutability: "nonpayable", inputs: [{ name: "agreementId", type: "uint256" }], outputs: [] },
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

export async function nextBaseAgreementId() {
  if (!BASE_ESCROW_ADDRESS) throw new Error("Base escrow is not configured");
  return basePublicClient.readContract({ address: BASE_ESCROW_ADDRESS, abi: baseEscrowAbi, functionName: "nextAgreementId" });
}

export async function waitForBaseReceipt(hash: `0x${string}`) {
  return basePublicClient.waitForTransactionReceipt({ hash });
}

export const usdcAbi = [
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] },
] as const;

/** User-signed Base Sepolia transaction; USDC never transits GenLayer. */
export async function writeBaseContract(
  provider: unknown, account: Address, address: Address,
  abi: typeof baseEscrowAbi | typeof usdcAbi, functionName: string, args: readonly unknown[],
) {
  if (!BASE_ESCROW_ADDRESS) throw new Error("Base escrow is not configured");
  const client = createWalletClient({ account, chain: baseSepolia, transport: custom(provider as Parameters<typeof custom>[0]) });
  return client.writeContract({ address, abi, functionName: functionName as never, args: args as never });
}
