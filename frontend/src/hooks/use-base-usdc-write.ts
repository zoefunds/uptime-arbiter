"use client";

import { useCallback, useState } from "react";
import { useAccount } from "wagmi";
import { BASE_ESCROW_ADDRESS, BASE_SEPOLIA_USDC, baseEscrowAbi, nextBaseAgreementId, usdcAbi, waitForBaseReceipt, writeBaseContract } from "@/lib/base";

export function useBaseUsdcWrite() {
  const { address, connector } = useAccount();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const send = useCallback(async (method: "propose" | "fundProvider" | "fundCustomer", args: readonly unknown[]) => {
    if (!address || !connector) throw new Error("Connect a Base Sepolia wallet first");
    setPending(true); setError(null); setTxHash(null);
    try {
      const provider = await connector.getProvider();
      const hash = await writeBaseContract(provider, address, BASE_ESCROW_ADDRESS, baseEscrowAbi, method, args);
      setTxHash(hash); return hash;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause)); return null;
    } finally { setPending(false); }
  }, [address, connector]);
  const approveUsdc = useCallback(async (amount: bigint) => {
    if (!address || !connector) throw new Error("Connect a Base Sepolia wallet first");
    const provider = await connector.getProvider();
    return writeBaseContract(provider, address, BASE_SEPOLIA_USDC, usdcAbi, "approve", [BASE_ESCROW_ADDRESS, amount]);
  }, [address, connector]);
  return { send, approveUsdc, nextBaseAgreementId, waitForBaseReceipt, pending, error, txHash, baseEscrowAddress: BASE_ESCROW_ADDRESS };
}
