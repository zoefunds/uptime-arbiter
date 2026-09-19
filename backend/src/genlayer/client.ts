import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import type { CalldataEncodable } from "genlayer-js/types";
import { config } from "../config.js";
import { withRateLimit } from "../lib/rateLimiter.js";

// Read-only client. This backend NEVER signs or submits a write transaction
// on anyone's behalf — every write (lock_provider_escrow, submit_claim,
// file_challenge, withdraw, etc.) is signed client-side, from the user's own
// wallet, via genlayer-js in the browser. This client exists solely so the
// indexer and a handful of convenience read-relay routes can call the
// contract's @gl.public.view methods without every page load hitting
// StudioNet directly and burning into the 30 req/min ceiling from N
// concurrent browser tabs at once.
const client = createClient({
  chain: studionet,
  // No account/provider attached — a client with no signer can still call
  // readContract, which is all this service ever does.
});

const CONTRACT_ADDRESS = config.genlayer.contractAddress as `0x${string}`;

async function readView<T>(functionName: string, args: CalldataEncodable[] = []): Promise<T> {
  return withRateLimit(async () => {
    const result = await client.readContract({
      address: CONTRACT_ADDRESS,
      functionName,
      args,
    });
    return result as T;
  });
}

export const contract = {
  getProtocolConfig: () => readView<Record<string, unknown>>("get_protocol_config"),
  getProtocolStats: () => readView<Record<string, unknown>>("get_protocol_stats"),

  listSlaIds: (offset: number, limit: number) =>
    readView<string[]>("list_sla_ids", [offset, limit]),
  getSla: (slaId: string) => readView<Record<string, unknown>>("get_sla", [slaId]),

  listClaimIds: (offset: number, limit: number) =>
    readView<string[]>("list_claim_ids", [offset, limit]),
  getClaim: (claimId: string) => readView<Record<string, unknown>>("get_claim", [claimId]),

  getChallenge: (challengeId: string) =>
    readView<Record<string, unknown>>("get_challenge", [challengeId]),

  getWithdrawableBalance: (address: string) =>
    readView<string>("get_withdrawable_balance", [address]),
};

export { CONTRACT_ADDRESS };
