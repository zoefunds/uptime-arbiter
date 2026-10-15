"use client";

import { useState, useCallback } from "react";
import { useAccount } from "wagmi";
import type { CalldataEncodable } from "genlayer-js/types";
import { writeContractMethod } from "@/lib/genlayer";

interface WriteState {
  pending: boolean;
  error: string | null;
  warning: string | null;
  txId: string | null;
}

/**
 * Thin wrapper around a contract write that surfaces the real transaction
 * lifecycle (pending -> submitted -> finalized -> error) to the UI, instead
 * of an optimistic client-side timer. `writeContractMethod` awaits the
 * returning at consensus acceptance before the transaction is final.
 *
 * A polling timeout (`timedOut: true`) is surfaced as a `warning`, not an
 * `error` — the transaction was already submitted by that point, so giving
 * up on watching it is not the same as the write failing. Only genuine
 * failures (wallet rejection, contract revert, no wallet connected) set
 * `error`.
 */
export function useGenlayerWrite() {
  const { address, connector } = useAccount();
  const [state, setState] = useState<WriteState>({
    pending: false,
    error: null,
    warning: null,
    txId: null,
  });

  const send = useCallback(
    async (functionName: string, args: CalldataEncodable[] = [], value?: bigint) => {
      if (!address || !connector) {
        setState({ pending: false, error: "Connect a wallet first", warning: null, txId: null });
        return null;
      }
      setState({ pending: true, error: null, warning: null, txId: null });
      try {
        const provider = await connector.getProvider();
        const { txId, timedOut } = await writeContractMethod(
          provider,
          address as `0x${string}`,
          functionName,
          args,
          value,
        );
        setState({
          pending: false,
          error: null,
          warning: timedOut
            ? "Submitted, but not yet FINALIZED. No dependent Base action was sent. Do not repeat this transaction; verify it on the explorer or refresh after finalization."
            : null,
          txId,
        });
        return timedOut ? null : txId;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Transaction failed";
        setState({ pending: false, error: message, warning: null, txId: null });
        return null;
      }
    },
    [address, connector],
  );

  return { send, ...state, connectedAddress: address ?? null };
}
