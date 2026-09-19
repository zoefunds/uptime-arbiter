"use client";

import { use, useState } from "react";
import { useAccount } from "wagmi";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatGen, formatTs, timeRemaining, shortAddress, STATUS_LABELS } from "@/lib/format";
import { Card, StatusChip, Button, LoadingState, ErrorState } from "@/components/ui";
import { useGenlayerWrite } from "@/hooks/use-genlayer-write";

const RESOLVED = ["RESOLVED_BREACH", "RESOLVED_PARTIAL", "RESOLVED_NO_BREACH"];

export default function ClaimDetailPage({ params }: { params: Promise<{ claimId: string }> }) {
  const { claimId } = use(params);
  const { address } = useAccount();
  const queryClient = useQueryClient();
  const { send, pending, error: writeError, warning: writeWarning, txId } = useGenlayerWrite();

  const [slaId, setSlaId] = useState<string | null>(null);
  const [challengeUrl1, setChallengeUrl1] = useState("");
  const [challengeUrl2, setChallengeUrl2] = useState("");
  const [rationale, setRationale] = useState("");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["claim", claimId],
    queryFn: () => api.getClaim(claimId),
    refetchInterval: 8_000,
  });

  const slaQuery = useQuery({
    queryKey: ["sla", data?.claim.slaId],
    queryFn: () => api.getSla(data!.claim.slaId),
    enabled: !!data?.claim.slaId,
  });

  if (isLoading) return <div className="px-4 py-16 lg:px-6"><LoadingState /></div>;
  if (isError || !data) return <div className="px-4 py-16 lg:px-6"><ErrorState message="Claim not found" /></div>;

  const { claim, challenge } = data;
  const sla = slaQuery.data?.sla;
  const now = Math.floor(Date.now() / 1000);
  const isParty = sla && address && (address.toLowerCase() === sla.provider.toLowerCase() || address.toLowerCase() === sla.customer.toLowerCase());

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["claim", claimId] });
  }

  async function handleEvaluate() {
    const ok = await send("evaluate_claim", [claimId]);
    if (ok) refresh();
  }

  async function handleFileChallenge() {
    if (!sla) return;
    const sources = [challengeUrl1, challengeUrl2].map((s) => s.trim()).filter(Boolean);
    if (sources.length === 0 || !rationale.trim()) {
      alert("At least one additional source and a rationale are required.");
      return;
    }
    const ok = await send(
      "file_challenge",
      [claimId, sources, rationale.trim()],
      BigInt(sla.challengeBondWei),
    );
    if (ok) refresh();
  }

  async function handleResolveChallenge() {
    if (!challenge) return;
    const ok = await send("resolve_challenge", [challenge.challengeId]);
    if (ok) refresh();
  }

  async function handleFinalize() {
    const ok = await send("finalize_claim", [claimId]);
    if (ok) refresh();
  }

  return (
    <div className="mx-auto flex w-full max-w-[1720px] flex-col gap-6 px-4 py-8 lg:px-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <span className="font-mono text-xs text-primary">{claim.claimId}</span>
            <StatusChip status={claim.status} />
            {claim.isChallenged && <StatusChip status="CHALLENGED" />}
          </div>
          <h1 className="font-display text-2xl font-bold text-on-surface lg:text-3xl">
            SLA {claim.slaId} — Breach Claim
          </h1>
          <p className="mt-1 font-mono text-xs text-on-surface-variant">
            Pinned window: {formatTs(claim.windowStartTs)} → {formatTs(claim.windowEndTs)}
          </p>
        </div>
      </div>

      {writeError && <div className="rounded bg-error/10 px-4 py-3 font-mono text-xs text-error">{writeError}</div>}
      {writeWarning && <div className="rounded bg-tertiary/10 px-4 py-3 font-mono text-xs text-tertiary">{writeWarning}</div>}
      {txId && !writeWarning && (
        <div className="rounded bg-secondary/10 px-4 py-3 font-mono text-xs text-secondary">
          Transaction accepted: {txId}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <div className="flex flex-col gap-6 xl:col-span-8">
          <Card>
            <h2 className="mb-4 font-display text-lg font-semibold text-on-surface">
              Pinned Evidence Sources
            </h2>
            <div className="flex flex-col gap-2">
              {claim.pinnedSources.map((url, i) => (
                <div key={url} className="flex items-center gap-2 rounded bg-surface-container p-2.5">
                  <span className="flex h-6 w-6 items-center justify-center rounded bg-surface-container-highest font-mono text-xs font-bold text-primary">
                    {String.fromCharCode(65 + i)}
                  </span>
                  <span className="truncate font-mono text-xs text-on-surface">{url}</span>
                </div>
              ))}
              {challenge?.additionalSources.map((url) => (
                <div key={url} className="flex items-center gap-2 rounded bg-tertiary/10 p-2.5">
                  <span className="flex h-6 w-6 items-center justify-center rounded bg-tertiary/20 font-mono text-xs font-bold text-tertiary">
                    +
                  </span>
                  <span className="truncate font-mono text-xs text-on-surface">{url}</span>
                  <span className="ml-auto font-mono text-[10px] uppercase text-tertiary">Challenge-added</span>
                </div>
              ))}
            </div>
          </Card>

          {claim.status === "PINNED" && (
            <Card>
              <h2 className="mb-2 font-display text-lg font-semibold text-on-surface">
                Independent Validator Evaluation
              </h2>
              <p className="mb-4 text-sm text-on-surface-variant">
                Every validator will independently fetch every pinned source above and compute
                breach-minutes for the claimed window. This is a permissionless trigger — anyone
                can call it once the claim is pinned.
              </p>
              <Button disabled={pending} onClick={handleEvaluate}>
                {pending ? "Running consensus…" : "Trigger Evidence Evaluation"}
              </Button>
            </Card>
          )}

          {RESOLVED.includes(claim.status) && (
            <Card>
              <h2 className="mb-4 font-display text-lg font-semibold text-on-surface">
                Consensus Verdict
              </h2>
              <div className="grid grid-cols-2 gap-4 font-mono text-sm md:grid-cols-4">
                <Field label="Verdict" value={STATUS_LABELS[claim.status] ?? claim.status} />
                <Field label="Agreed Breach" value={`${claim.breachMinutes} min`} />
                <Field label="Computed Payout" value={`${formatGen(claim.payoutWei)} GEN`} />
                <Field label="Resolved At" value={claim.resolvedAt || "—"} />
              </div>
            </Card>
          )}

          {claim.status === "INCONCLUSIVE" && (
            <Card>
              <h2 className="mb-2 font-display text-lg font-semibold text-error">Inconclusive</h2>
              <p className="text-sm text-on-surface-variant">{claim.inconclusiveReason}</p>
              <p className="mt-2 text-xs text-on-surface-variant">
                The SLA remains active — the customer may submit a new claim for a different or
                corrected window.
              </p>
            </Card>
          )}

          {challenge && (
            <Card>
              <h2 className="mb-4 font-display text-lg font-semibold text-on-surface">
                Challenge {challenge.challengeId}
              </h2>
              <div className="grid grid-cols-2 gap-4 font-mono text-sm md:grid-cols-4">
                <Field label="Challenger" value={shortAddress(challenge.challenger)} />
                <Field label="Bond" value={`${formatGen(challenge.bondWei)} GEN`} />
                <Field label="Outcome" value={challenge.outcome} />
                <Field
                  label="Re-adjudicated Breach"
                  value={challenge.resolved ? `${challenge.newBreachMinutes} min` : "pending"}
                />
              </div>
              <p className="mt-3 text-sm text-on-surface-variant">
                <strong className="text-on-surface">Rationale:</strong> {challenge.rationale}
              </p>
              {!challenge.resolved && (
                <Button className="mt-4" disabled={pending} onClick={handleResolveChallenge}>
                  {pending ? "Re-adjudicating…" : "Trigger Re-Adjudication"}
                </Button>
              )}
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-6 xl:col-span-4">
          {RESOLVED.includes(claim.status) && !claim.finalized && (
            <Card>
              <h2 className="mb-2 font-display text-lg font-semibold text-on-surface">
                Challenge Window
              </h2>
              <p className="mb-4 font-mono text-sm text-tertiary">
                {timeRemaining(Number(claim.challengeDeadlineTs))}
              </p>

              {!claim.isChallenged && isParty && now < Number(claim.challengeDeadlineTs) && claim.challengeCount < 2 && (
                <div className="flex flex-col gap-3 border-t border-outline-variant pt-4">
                  <p className="text-xs text-on-surface-variant">
                    File an additive-only challenge with new evidence sources (never replacing the
                    original pinned set).
                  </p>
                  <input
                    placeholder="Additional source URL"
                    value={challengeUrl1}
                    onChange={(e) => setChallengeUrl1(e.target.value)}
                    className="rounded bg-surface-container-lowest px-3 py-2 font-mono text-xs text-on-surface"
                  />
                  <input
                    placeholder="Second source URL (optional)"
                    value={challengeUrl2}
                    onChange={(e) => setChallengeUrl2(e.target.value)}
                    className="rounded bg-surface-container-lowest px-3 py-2 font-mono text-xs text-on-surface"
                  />
                  <textarea
                    placeholder="Rationale for this challenge"
                    value={rationale}
                    onChange={(e) => setRationale(e.target.value)}
                    rows={3}
                    className="rounded bg-surface-container-lowest px-3 py-2 text-xs text-on-surface"
                  />
                  <Button variant="secondary" disabled={pending} onClick={handleFileChallenge}>
                    {pending ? "Staking bond…" : "Stake Bond & File Challenge"}
                  </Button>
                </div>
              )}

              {!claim.isChallenged && now >= Number(claim.challengeDeadlineTs) && (
                <Button disabled={pending} onClick={handleFinalize}>
                  {pending ? "Finalizing…" : "Finalize & Release Funds"}
                </Button>
              )}
            </Card>
          )}

          {claim.finalized && (
            <Card>
              <p className="font-mono text-sm text-secondary">
                ✓ Finalized — settlement moved to withdrawable balances.
              </p>
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
