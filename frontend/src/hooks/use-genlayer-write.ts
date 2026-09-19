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
 * lifecycle (pending -> submitted -> accepted -> error) to the UI, instead
 * of an optimistic client-side timer. `writeContractMethod` awaits the
 * SDK's own `waitForTransactionReceipt(..., status: "ACCEPTED")`.
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
            ? "Submitted, but we stopped watching for confirmation before it came back — it likely still went through. Refresh in a moment to check, or look up the transaction on the explorer."
            : null,
          txId,
        });
        return txId;
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
