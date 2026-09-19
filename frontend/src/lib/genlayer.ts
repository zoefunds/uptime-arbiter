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

  // Track real on-chain lifecycle via the SDK's own status polling — never
  // a client-side timer standing in for it. We wait for ACCEPTED, not
  // FINALIZED: state changes (escrow locked, claim pinned, verdict
  // recorded, ...) already apply once a transaction is ACCEPTED —
  // FINALIZED only means the appeal window has additionally closed. The
  // SDK's own default retry budget (3s interval x 10 retries = 30s) is
  // tuned for ACCEPTED, not for FINALIZED, which routinely takes longer
  // than that; waiting on FINALIZED with the default budget was
  // surfacing "Timed out... (current status: 5)" — status 5 is ACCEPTED,
  // i.e. the write had already succeeded — as if it were a failure.
  try {
    const receipt = await client.waitForTransactionReceipt({
      hash: txId,
      status: TransactionStatus.ACCEPTED,
      interval: 2_500,
      retries: 60, // up to ~2.5 minutes, generous for a normal consensus round
    });
    return { txId, receipt, timedOut: false };
  } catch (err) {
    // The transaction was already submitted and broadcast at this point —
    // a polling timeout here means the SDK gave up watching, not that the
    // write failed. Surface txId so the caller can still tell the user
    // "submitted, check back" instead of "failed", and let them verify via
    // the explorer or a subsequent read rather than silently losing the
    // reference to a transaction that may well succeed a minute later.
    const message = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line no-console
    console.warn(`waitForTransactionReceipt gave up on ${txId}, tx may still finalize:`, message);
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
