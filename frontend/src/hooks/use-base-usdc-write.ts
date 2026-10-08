"use client";

import { useCallback, useState } from "react";
import { useAccount } from "wagmi";
import { BASE_ESCROW_ADDRESS, BASE_SEPOLIA_USDC, assertBaseSigningAccount, baseEscrowAbi, nextBaseAgreementId, usdcAbi, waitForBaseReceipt, writeBaseContract } from "@/lib/base";

export type BaseTransactionProgress = {
  stage: "idle" | "preparing" | "awaiting-wallet" | "submitted" | "confirming" | "confirmed" | "failed";
  message: string;
  txHash: string | null;
};

export function useBaseUsdcWrite() {
  const { address, connector } = useAccount();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [progress, setProgress] = useState<BaseTransactionProgress>({ stage: "idle", message: "", txHash: null });
  const send = useCallback(async (method: "propose" | "fundProvider" | "fundCustomer", args: readonly unknown[]) => {
    if (!address || !connector) throw new Error("Connect a Base Sepolia wallet first");
    setPending(true); setError(null); setTxHash(null);
    try {
      const provider = await connector.getProvider();
      setProgress({ stage: "preparing", message: "Checking the active Base Sepolia wallet…", txHash: null });
      await assertBaseSigningAccount(provider, address);
      setProgress({ stage: "awaiting-wallet", message: `Confirm the ${method === "propose" ? "SLA proposal" : method === "fundProvider" ? "provider escrow deposit" : "customer bond deposit"} in your wallet.`, txHash: null });
      const hash = await writeBaseContract(provider, address, BASE_ESCROW_ADDRESS, baseEscrowAbi, method, args);
      setTxHash(hash);
      setProgress({ stage: "submitted", message: "Transaction submitted to Base Sepolia.", txHash: hash });
      setProgress({ stage: "confirming", message: "Confirming the transaction on Base Sepolia…", txHash: hash });
      await waitForBaseReceipt(hash);
      setProgress({ stage: "confirmed", message: "Base Sepolia transaction confirmed.", txHash: hash });
      return hash;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(message); setProgress({ stage: "failed", message, txHash: null }); return null;
    } finally { setPending(false); }
  }, [address, connector]);
  const approveUsdc = useCallback(async (amount: bigint) => {
    if (!address || !connector) throw new Error("Connect a Base Sepolia wallet first");
    setPending(true); setError(null); setTxHash(null);
    try {
      const provider = await connector.getProvider();
      setProgress({ stage: "preparing", message: "Checking the active Base Sepolia wallet…", txHash: null });
      await assertBaseSigningAccount(provider, address);
      setProgress({ stage: "awaiting-wallet", message: "Confirm the USDC approval in your wallet.", txHash: null });
      const hash = await writeBaseContract(provider, address, BASE_SEPOLIA_USDC, usdcAbi, "approve", [BASE_ESCROW_ADDRESS, amount]);
      setTxHash(hash);
      setProgress({ stage: "submitted", message: "USDC approval submitted to Base Sepolia.", txHash: hash });
      setProgress({ stage: "confirming", message: "Confirming the USDC approval on Base Sepolia…", txHash: hash });
      await waitForBaseReceipt(hash);
      setProgress({ stage: "confirmed", message: "USDC approval confirmed on Base Sepolia.", txHash: hash });
      return hash;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(message); setProgress({ stage: "failed", message, txHash: null });
      throw new Error(message);
    } finally { setPending(false); }
  }, [address, connector]);
  return { send, approveUsdc, nextBaseAgreementId, waitForBaseReceipt, pending, error, txHash, progress, baseEscrowAddress: BASE_ESCROW_ADDRESS };
}
