import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";
import type { CalldataEncodable } from "genlayer-js/types";

// A missing public build variable must never silently revive an older
// deployment. This is the verified StudioNet adjudicator; deployment
// configuration may override it only for an intentional future migration.
export const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ||
  "0x3C81652798479Af674294155e5bf05C5F42D46f7") as `0x${string}`;

type Eip1193Provider = { request(args: { method: string; params?: unknown[] }): Promise<unknown> };
const STUDIONET_CHAIN_ID_HEX = `0x${studionet.id.toString(16)}`;

/** Switch the connected wallet before a signed GenLayer transaction. */
async function ensureStudioNet(provider: unknown) {
  const wallet = provider as Eip1193Provider;
  if (!wallet?.request) throw new Error("Your connected wallet does not support GenLayer transactions");
  const chainId = async () => String(await wallet.request({ method: "eth_chainId" })).toLowerCase();
  if (await chainId() === STUDIONET_CHAIN_ID_HEX) return;
  try {
    await wallet.request({ method: "wallet_switchEthereumChain", params: [{ chainId: STUDIONET_CHAIN_ID_HEX }] });
  } catch {
    // Add StudioNet below if the wallet has not seen it before.
  }
  if (await chainId() === STUDIONET_CHAIN_ID_HEX) return;
  await wallet.request({
    method: "wallet_addEthereumChain",
    params: [{
      chainId: STUDIONET_CHAIN_ID_HEX,
      chainName: studionet.name,
      nativeCurrency: studionet.nativeCurrency,
      rpcUrls: studionet.rpcUrls.default.http,
      blockExplorerUrls: studionet.blockExplorers?.default ? [studionet.blockExplorers.default.url] : undefined,
    }],
  });
  await wallet.request({ method: "wallet_switchEthereumChain", params: [{ chainId: STUDIONET_CHAIN_ID_HEX }] });
  if (await chainId() !== STUDIONET_CHAIN_ID_HEX) throw new Error("Please switch your wallet to GenLayer StudioNet to continue");
}

/**
 * Every write in this app (lock_provider_escrow, co_sign_and_lock_bond,
 * submit_claim, evaluate_claim, file_challenge, resolve_challenge,
 * finalize_claim, withdraw, ...) is signed by the connected wallet and sent
 * DIRECTLY from the browser to the deployed Intelligent Contract via this
 * client — never proxied through our own backend. That's the trust
 * boundary the whole protocol depends on: no centralized service ever
 * makes a breach determination or moves money on a user's behalf.
 *
 * `provider` is the EIP-1193 provider from the connected wallet (injected
 * by wagmi/AppKit); `account` is the connected address.
 */
export function getGenlayerClient(provider: unknown, account: `0x${string}`) {
  return createClient({
    chain: studionet,
    account,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    provider: provider as any,
  });
}

export function getReadOnlyGenlayerClient() {
  return createClient({ chain: studionet });
}

export async function writeContractMethod(
  provider: unknown,
  account: `0x${string}`,
  functionName: string,
  args: CalldataEncodable[] = [],
  value?: bigint,
) {
  await ensureStudioNet(provider);
  const client = getGenlayerClient(provider, account);

  const txId = await client.writeContract({
    address: CONTRACT_ADDRESS,
    functionName,
    args,
    value: value ?? 0n,
  });

  // Financially consequential follow-up work is permitted only after the
  // GenLayer appeal/finalization window closes. ACCEPTED consensus alone is
  // intentionally insufficient: an accepted execution can still be appealed,
  // and a consensus-accepted transaction can contain a contract execution error.
  try {
    const receipt = await client.waitForTransactionReceipt({
      hash: txId,
      status: TransactionStatus.FINALIZED,
      interval: 5_000,
      retries: 120,
    });
    const candidate = receipt as unknown as { consensus_data?: { leader_receipt?: unknown } };
    const rawLeader = candidate.consensus_data?.leader_receipt;
    const leader = Array.isArray(rawLeader) ? rawLeader[0] : rawLeader;
    const execution = leader as { execution_result?: string; genvm_result?: { status?: string }; result?: string } | undefined;
    const status = execution?.execution_result ?? execution?.genvm_result?.status;
    if (typeof status === "string" && status.toUpperCase() === "ERROR") {
      throw new Error(`GenLayer transaction finalized with a contract execution error: ${txId}`);
    }
    return { txId, receipt, timedOut: false };
  } catch (err) {
    // The transaction was already submitted and broadcast at this point —
    // a polling timeout here means the SDK gave up watching, not that the
    // write failed. Surface txId so the caller can still tell the user
    // "submitted, check back" instead of "failed", and let them verify via
    // the explorer or a subsequent read rather than silently losing the
    // reference to a transaction that may well succeed a minute later.
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`waitForTransactionReceipt gave up on ${txId}; no dependent action will run:`, message);
    return { txId, receipt: null, timedOut: true };
  }
}

export async function readContractMethod<T>(
  functionName: string,
  args: CalldataEncodable[] = [],
): Promise<T> {
  const client = getReadOnlyGenlayerClient();
  return client.readContract({
    address: CONTRACT_ADDRESS,
    functionName,
    args,
  }) as Promise<T>;
}
