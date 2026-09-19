"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatGen, formatTs, shortAddress, STATUS_LABELS } from "@/lib/format";
import { Card, StatusChip, Button, LoadingState, ErrorState } from "@/components/ui";
import { useGenlayerWrite } from "@/hooks/use-genlayer-write";

export default function SlaDetailPage({ params }: { params: Promise<{ slaId: string }> }) {
  const { slaId } = use(params);
  const { address } = useAccount();
  const queryClient = useQueryClient();
  const { send, pending, error: writeError, warning: writeWarning, txId } = useGenlayerWrite();
  const [windowStart, setWindowStart] = useState("");
  const [windowEnd, setWindowEnd] = useState("");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["sla", slaId],
    queryFn: () => api.getSla(slaId),
    refetchInterval: 10_000,
  });

  if (isLoading) return <div className="px-4 py-16 lg:px-6"><LoadingState /></div>;
  if (isError || !data) return <div className="px-4 py-16 lg:px-6"><ErrorState message="SLA not found" /></div>;

  const { sla, claims } = data;
  const isProvider = address?.toLowerCase() === sla.provider.toLowerCase();
  const isCustomer = address?.toLowerCase() === sla.customer.toLowerCase();
  const now = Math.floor(Date.now() / 1000);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["sla", slaId] });
  }

  async function handleLockEscrow() {
    const value = BigInt(sla.escrowWei);
    const ok = await send("lock_provider_escrow", [sla.slaId], value);
    if (ok) refresh();
  }

  async function handleCoSign() {
    const value = BigInt(sla.bondWei);
    const ok = await send("co_sign_and_lock_bond", [sla.slaId, sla.sourceDigest], value);
    if (ok) refresh();
  }

  async function handleCancel() {
    const ok = await send("cancel_sla", [sla.slaId]);
    if (ok) refresh();
  }

  async function handleTerminate() {
    const ok = await send("terminate_expired_sla", [sla.slaId]);
    if (ok) refresh();
  }

  async function handleSubmitClaim() {
    const startTs = Math.floor(new Date(windowStart).getTime() / 1000);
    const endTs = Math.floor(new Date(windowEnd).getTime() / 1000);
    if (!startTs || !endTs || endTs <= startTs) return;
    const ok = await send("submit_claim", [sla.slaId, startTs, endTs]);
    if (ok) refresh();
  }

  return (
    <div className="mx-auto flex w-full max-w-[1720px] flex-col gap-6 px-4 py-8 lg:px-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <span className="font-mono text-xs text-primary">{sla.slaId}</span>
            <StatusChip status={sla.status} />
          </div>
          <h1 className="font-display text-2xl font-bold text-on-surface lg:text-3xl">{sla.label}</h1>
        </div>
      </div>

      {writeError && (
        <div className="rounded bg-error/10 px-4 py-3 font-mono text-xs text-error">{writeError}</div>
      )}
      {writeWarning && (
        <div className="rounded bg-tertiary/10 px-4 py-3 font-mono text-xs text-tertiary">{writeWarning}</div>
      )}
      {txId && !writeWarning && (
        <div className="rounded bg-secondary/10 px-4 py-3 font-mono text-xs text-secondary">
          Transaction accepted: {txId}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <div className="flex flex-col gap-6 xl:col-span-8">
          <Card>
            <h2 className="mb-4 font-display text-lg font-semibold text-on-surface">Terms</h2>
            <div className="grid grid-cols-2 gap-4 font-mono text-sm md:grid-cols-3">
              <Field label="Provider" value={shortAddress(sla.provider)} />
              <Field label="Customer" value={shortAddress(sla.customer)} />
              <Field label="Target Uptime" value={`${(sla.targetUptimeBps / 100).toFixed(2)}%`} />
              <Field label="Grace" value={`${sla.graceMinutes} min`} />
              <Field label="Penalty Rate" value={`${formatGen(sla.penaltyRateWeiPerMin)} GEN/min`} />
              <Field label="Tolerance" value={`± ${sla.toleranceMinutes} min`} />
              <Field label="Challenge Window" value={`${(sla.challengeWindowSeconds / 3600).toFixed(0)}h`} />
              <Field label="Term Start" value={sla.termStartTs === "0" ? "—" : formatTs(sla.termStartTs)} />
              <Field label="Term End" value={sla.termEndTs === "0" ? "—" : formatTs(sla.termEndTs)} />
            </div>
          </Card>

          <Card>
            <h2 className="mb-4 font-display text-lg font-semibold text-on-surface">
              Pinned Evidence Sources ({sla.evidenceSources.length})
            </h2>
            <div className="flex flex-col gap-2">
              {sla.evidenceSources.map((url, i) => (
                <div key={url} className="flex items-center gap-2 rounded bg-surface-container p-2.5">
                  <span className="flex h-6 w-6 items-center justify-center rounded bg-surface-container-highest font-mono text-xs font-bold text-primary">
                    {String.fromCharCode(65 + i)}
                  </span>
                  <span className="truncate font-mono text-xs text-on-surface">{url}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 rounded bg-surface-container-lowest px-3 py-2 font-mono text-[11px] text-on-surface-variant">
              Fingerprint: <span className="text-primary">{sla.sourceDigest}</span> — immutable once
              both parties fund the SLA.
            </div>
            {sla.exclusionTerms && (
              <div className="mt-3 rounded bg-surface-container p-3 text-xs text-on-surface-variant">
                <span className="mb-1 block font-mono text-[10px] uppercase text-tertiary">
                  Pinned Exclusion Terms
                </span>
                {sla.exclusionTerms}
              </div>
            )}
          </Card>

          <Card>
            <h2 className="mb-4 font-display text-lg font-semibold text-on-surface">Claim History</h2>
            {claims.length === 0 ? (
              <p className="text-sm text-on-surface-variant">No claims filed on this SLA yet.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {claims.map((claim) => (
                  <Link
                    key={claim.claimId}
                    href={`/claims/${claim.claimId}`}
                    className="flex items-center justify-between rounded bg-surface-container p-3 transition-colors hover:bg-surface-container-high"
                  >
                    <div className="flex flex-col">
                      <span className="font-mono text-sm text-on-surface">{claim.claimId}</span>
                      <span className="font-mono text-xs text-on-surface-variant">
                        {formatTs(claim.windowStartTs)} → {formatTs(claim.windowEndTs)}
                      </span>
                    </div>
                    <StatusChip status={claim.status} />
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-6 xl:col-span-4">
          <Card>
            <h2 className="mb-4 font-display text-lg font-semibold text-on-surface">Escrow Status</h2>
            <div className="mb-4 flex flex-col gap-2 font-mono text-xs">
              <StatusRow label="Provider escrow" done={sla.providerFunded} amount={`${formatGen(sla.escrowWei)} GEN`} />
              <StatusRow label="Customer bond" done={sla.customerSigned} amount={`${formatGen(sla.bondWei)} GEN`} />
            </div>

            {sla.status === "PROPOSED" && isProvider && !sla.providerFunded && (
              <Button className="w-full" disabled={pending} onClick={handleLockEscrow}>
                {pending ? "Confirming…" : `Lock Escrow (${formatGen(sla.escrowWei)} GEN)`}
              </Button>
            )}
            {sla.status === "PROPOSED" && isCustomer && !sla.customerSigned && (
              <Button className="w-full" disabled={pending} onClick={handleCoSign}>
                {pending ? "Confirming…" : `Co-Sign & Lock Bond (${formatGen(sla.bondWei)} GEN)`}
              </Button>
            )}
            {sla.status === "PROPOSED" && (isProvider || isCustomer) && (
              <Button variant="secondary" className="mt-2 w-full" disabled={pending} onClick={handleCancel}>
                Cancel Proposal
              </Button>
            )}
            {sla.status === "ACTIVE" && sla.activeClaimId === "" && Number(sla.termEndTs) < now && (
              <Button variant="secondary" className="w-full" disabled={pending} onClick={handleTerminate}>
                Terminate Expired SLA
              </Button>
            )}
          </Card>

          {sla.status === "ACTIVE" && isCustomer && sla.activeClaimId === "" && (
            <Card>
              <h2 className="mb-4 font-display text-lg font-semibold text-on-surface">Submit Breach Claim</h2>
              <div className="flex flex-col gap-3">
                <label className="flex flex-col gap-1">
                  <span className="font-mono text-[10px] uppercase text-on-surface-variant">Window Start (UTC)</span>
                  <input
                    type="datetime-local"
                    value={windowStart}
                    onChange={(e) => setWindowStart(e.target.value)}
                    className="rounded bg-surface-container-lowest px-3 py-2 font-mono text-sm text-on-surface"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="font-mono text-[10px] uppercase text-on-surface-variant">Window End (UTC)</span>
                  <input
                    type="datetime-local"
                    value={windowEnd}
                    onChange={(e) => setWindowEnd(e.target.value)}
                    className="rounded bg-surface-container-lowest px-3 py-2 font-mono text-sm text-on-surface"
                  />
                </label>
                <Button disabled={pending} onClick={handleSubmitClaim}>
                  {pending ? "Submitting…" : "Pin Claim & Submit"}
                </Button>
              </div>
            </Card>
          )}

          {sla.activeClaimId && (
            <Card>
              <p className="mb-2 font-mono text-[10px] uppercase text-on-surface-variant">Open Claim</p>
              <Link
                href={`/claims/${sla.activeClaimId}`}
                className="font-mono text-sm text-primary hover:underline"
              >
                {sla.activeClaimId} →
              </Link>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="font-mono text-[10px] uppercase text-on-surface-variant">{label}</span>
      <span className="text-on-surface">{value}</span>
    </div>
  );
}

function StatusRow({ label, done, amount }: { label: string; done: boolean; amount: string }) {
  return (
    <div className="flex items-center justify-between rounded bg-surface-container p-2.5">
      <span className="text-on-surface-variant">{label}</span>
      <span className={done ? "text-secondary" : "text-tertiary"}>
        {done ? `✓ ${amount}` : `Pending — ${amount}`}
      </span>
    </div>
  );
}
