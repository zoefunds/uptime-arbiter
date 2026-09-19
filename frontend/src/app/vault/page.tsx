"use client";

import { useAccount } from "wagmi";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatGen } from "@/lib/format";
import { Card, Button, EmptyState } from "@/components/ui";
import { useGenlayerWrite } from "@/hooks/use-genlayer-write";

export default function VaultPage() {
  const { address } = useAccount();
  const queryClient = useQueryClient();
  const { send, pending, error, txId } = useGenlayerWrite();

  const { data, isLoading } = useQuery({
    queryKey: ["withdrawable", address],
    queryFn: () => api.getWithdrawable(address!),
    enabled: !!address,
    refetchInterval: 10_000,
  });

  async function handleWithdraw() {
    const ok = await send("withdraw", []);
    if (ok) {
      await queryClient.invalidateQueries({ queryKey: ["withdrawable", address] });
    }
  }

  if (!address) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-24 text-center lg:px-6">
        <EmptyState
          title="Connect a wallet"
          description="Your withdrawable balance is per-address. Connect a wallet to see funds owed to you from settled claims, refunded escrow, or slashed bonds."
        />
      </div>
    );
  }

  const balance = data?.withdrawableWei ?? "0";
  const hasBalance = balance !== "0";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 lg:px-6">
      <div>
        <span className="mb-1 block font-mono text-[10px] uppercase tracking-widest text-primary">
          Pull-Based Settlement
        </span>
        <h1 className="font-display text-2xl font-bold uppercase text-on-surface lg:text-3xl">
          Vault & Withdrawals
        </h1>
        <p className="mt-2 text-sm text-on-surface-variant">
          Funds are never pushed automatically. Every settlement — claim payouts, escrow refunds,
          bond returns, slashed bond forfeitures — first credits your address&apos;s internal
          balance on the contract. Withdraw it here whenever you like.
        </p>
      </div>

      {error && <div className="rounded bg-error/10 px-4 py-3 font-mono text-xs text-error">{error}</div>}
      {txId && (
        <div className="rounded bg-secondary/10 px-4 py-3 font-mono text-xs text-secondary">
          Withdrawal finalized: {txId}
        </div>
      )}

      <Card className="flex flex-col items-center gap-4 py-12 text-center">
        <span className="font-mono text-[10px] uppercase tracking-wider text-on-surface-variant">
          Withdrawable Balance
        </span>
        <span className="font-mono text-4xl font-semibold text-secondary">
          {isLoading ? "…" : `${formatGen(balance)} GEN`}
        </span>
        <Button disabled={pending || !hasBalance} onClick={handleWithdraw}>
          {pending ? "Withdrawing…" : "Withdraw to Wallet"}
        </Button>
        {!hasBalance && !isLoading && (
          <p className="max-w-sm text-xs text-on-surface-variant">
            Nothing to withdraw yet. Balances appear here once a claim you&apos;re party to is
            finalized, an SLA proposal is cancelled, or a challenge bond is released.
          </p>
        )}
      </Card>
    </div>
  );
}
