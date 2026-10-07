"use client";

import { useAccount } from "wagmi";
import { Card, EmptyState } from "@/components/ui";

export default function VaultPage() {
  const { address } = useAccount();

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

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 lg:px-6">
      <div>
        <span className="mb-1 block font-mono text-[10px] uppercase tracking-widest text-primary">
          Base Sepolia Settlement
        </span>
        <h1 className="font-display text-2xl font-bold uppercase text-on-surface lg:text-3xl">
          USDC Settlement
        </h1>
        <p className="mt-2 text-sm text-on-surface-variant">
          Base Sepolia escrow transfers USDC directly when an adjudication is relayed. GenLayer
          holds no funds and has no withdrawal function.
        </p>
      </div>

      <Card className="flex flex-col items-center gap-4 py-12 text-center">
        <span className="font-mono text-[10px] uppercase tracking-wider text-on-surface-variant">
          Settlement destination
        </span>
        <span className="font-mono text-4xl font-semibold text-secondary">
          Your connected Base Sepolia wallet
        </span>
        <p className="max-w-sm text-xs text-on-surface-variant">Payouts and refunds arrive in USDC once the relayer submits the final GenLayer verdict to the Base escrow contract.</p>
      </Card>
    </div>
  );
}
