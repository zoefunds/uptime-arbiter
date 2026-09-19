"use client";

import { useState, useCallback } from "react";
import { useAccount } from "wagmi";
import type { CalldataEncodable } from "genlayer-js/types";
import { writeContractMethod } from "@/lib/genlayer";

interface WriteState {
  pending: boolean;
  error: string | null;
  txId: string | null;
}

/**
 * Thin wrapper around a contract write that surfaces the real transaction
 * lifecycle (pending -> submitted -> finalized -> error) to the UI, instead
 * of an optimistic client-side timer. `writeContractMethod` awaits the
 * SDK's own `waitForTransactionReceipt(..., status: "FINALIZED")` before
 * resolving.
 */
export function useGenlayerWrite() {
  const { address, connector } = useAccount();
  const [state, setState] = useState<WriteState>({ pending: false, error: null, txId: null });

  const send = useCallback(
    async (functionName: string, args: CalldataEncodable[] = [], value?: bigint) => {
      if (!address || !connector) {
        setState({ pending: false, error: "Connect a wallet first", txId: null });
        return null;
      }
      setState({ pending: true, error: null, txId: null });
      try {
        const provider = await connector.getProvider();
        const { txId } = await writeContractMethod(
          provider,
          address as `0x${string}`,
          functionName,
          args,
          value,
        );
        setState({ pending: false, error: null, txId });
        return txId;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Transaction failed";
        setState({ pending: false, error: message, txId: null });
        return null;
      }
    },
    [address, connector],
  );

  return { send, ...state, connectedAddress: address ?? null };
}
