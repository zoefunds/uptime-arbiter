import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";
import type { CalldataEncodable } from "genlayer-js/types";

export const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ??
  "") as `0x${string}`;

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
  const client = getGenlayerClient(provider, account);

  const txId = await client.writeContract({
    address: CONTRACT_ADDRESS,
    functionName,
    args,
    value: value ?? 0n,
  });

  // Wait for real on-chain finality via the SDK's own lifecycle tracking —
  // never a client-side timer standing in for status polling.
  const receipt = await client.waitForTransactionReceipt({
    hash: txId,
    status: TransactionStatus.FINALIZED,
  });

  return { txId, receipt };
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
