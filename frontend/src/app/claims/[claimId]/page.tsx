"use client";

import { use, useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatUsdc, formatTs, timeRemaining, shortAddress, STATUS_LABELS } from "@/lib/format";
import { Card, StatusChip, Button, LoadingState, ErrorState } from "@/components/ui";
import { useGenlayerWrite } from "@/hooks/use-genlayer-write";

const PROVISIONAL = ["PROVISIONAL_BREACH", "PROVISIONAL_PARTIAL", "PROVISIONAL_NO_BREACH", "PROVISIONAL_INCONCLUSIVE"];
const GEN_FINALIZED = ["FINALIZED_BREACH", "FINALIZED_PARTIAL", "FINALIZED_NO_BREACH", "FINALIZED_INCONCLUSIVE"];

type Incident = { start_ts?: number; end_ts?: number; service?: string; summary?: string; quotation?: string; excluded?: boolean; exclusion_reason?: string };
type SourceReport = { source_url?: string; source_fingerprint_sha256?: string; usable?: boolean; source_relevant?: boolean; covered_service_match?: boolean; source_summary?: string; breach_minutes?: number; incidents?: Incident[] };
type EvidenceReport = { breach_minutes?: number; reports?: SourceReport[] };

function parseEvidence(value?: string): EvidenceReport | null {
  try {
    return value ? JSON.parse(value) as EvidenceReport : null;
  } catch {
    return null;
  }
}

export default function ClaimDetailPage({ params }: { params: Promise<{ claimId: string }> }) {
  const { claimId } = use(params);
  const { address } = useAccount();
  const queryClient = useQueryClient();
  const { send, pending, error: writeError, warning: writeWarning, txId } = useGenlayerWrite();

  const [challengeUrl1, setChallengeUrl1] = useState("");
  const [challengeUrl2, setChallengeUrl2] = useState("");
  const [rationale, setRationale] = useState("");
  const [now, setNow] = useState(0);

  useEffect(() => {
    const update = () => setNow(Math.floor(Date.now() / 1000));
    update();
    const timer = window.setInterval(update, 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["claim", claimId],
    queryFn: () => api.getClaim(claimId),
    refetchInterval: 3_000,
  });

  const slaQuery = useQuery({
    queryKey: ["sla", data?.claim.slaId],
    queryFn: () => api.getSla(data!.claim.slaId),
    enabled: !!data?.claim.slaId,
    refetchInterval: 3_000,
  });

  const evidence = parseEvidence(data?.claim.evidenceReportJson);

  if (isLoading) return <div className="px-4 py-16 lg:px-6"><LoadingState /></div>;
  if (isError || !data) return <div className="px-4 py-16 lg:px-6"><ErrorState message="Claim not found" /></div>;

  const { claim, challenge } = data;
  const sla = slaQuery.data?.sla;
  const isParty = sla && address && (address.toLowerCase() === sla.provider.toLowerCase() || address.toLowerCase() === sla.customer.toLowerCase());

  async function refresh() {
    await api.refreshClaim(claimId).catch(() => undefined);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["claim", claimId] }),
      queryClient.invalidateQueries({ queryKey: ["claims"] }),
      queryClient.invalidateQueries({ queryKey: ["sla"] }),
      queryClient.invalidateQueries({ queryKey: ["slas"] }),
      queryClient.invalidateQueries({ queryKey: ["protocol-stats"] }),
    ]);
  }

  async function handleEvaluate() {
    const ok = await send("evaluate_claim", [claimId]);
    if (ok) await refresh();
  }

  async function handleFileChallenge() {
    if (!sla) return;
    const sources = [challengeUrl1, challengeUrl2].map((s) => s.trim()).filter(Boolean);
    if (sources.length === 0 || !rationale.trim()) {
      alert("At least one additional source and a rationale are required.");
      return;
    }
    const ok = await send("file_challenge", [claimId, sources, rationale.trim()]);
    if (ok) await refresh();
  }

  async function handleResolveChallenge() {
    const ok = await send("resolve_challenge", [claimId]);
    if (ok) await refresh();
  }

  async function handleFinalize() {
    const ok = await send("finalize_claim", [claimId]);
    if (ok) await refresh();
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
          Transaction finalized: {txId}
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

          {(PROVISIONAL.includes(claim.status) || GEN_FINALIZED.includes(claim.status) || claim.status === "CHALLENGED") && (
            <Card>
              <h2 className="mb-4 font-display text-lg font-semibold text-on-surface">
                Consensus Verdict
              </h2>
              <div className="grid grid-cols-2 gap-4 font-mono text-sm md:grid-cols-4">
                <Field label="Verdict" value={STATUS_LABELS[claim.status] ?? claim.status} />
                <Field label="Agreed Breach" value={`${claim.breachMinutes} min`} />
                <Field label="Indicative USDC Payout" value={`${formatUsdc(claim.payoutWei)} USDC`} />
                <Field label="Evidence Digest" value={claim.evidenceDigest || "—"} />
              </div>
            </Card>
          )}

          {claim.status.includes("INCONCLUSIVE") && (
            <Card>
              <h2 className="mb-2 font-display text-lg font-semibold text-error">Inconclusive</h2>
              <p className="text-sm text-on-surface-variant">{claim.inconclusiveReason}</p>
              <p className="mt-2 text-xs text-on-surface-variant">
                No payout can be relayed for an inconclusive ruling. The agreement remains protected
                until its bounded settlement deadline.
              </p>
            </Card>
          )}

          {evidence?.reports && evidence.reports.length > 0 && (
            <Card>
              <h2 className="mb-4 font-display text-lg font-semibold text-on-surface">Validator Evidence Record</h2>
              <div className="flex flex-col gap-4">
                {evidence.reports.map((report, index) => (
                  <div key={`${report.source_url}-${index}`} className="rounded bg-surface-container p-4">
                    <div className="grid gap-3 font-mono text-xs md:grid-cols-3">
                      <Field label={`Source ${index + 1}`} value={report.source_url || "—"} />
                      <Field label="SHA-256 Fingerprint" value={report.source_fingerprint_sha256 || "—"} />
                      <Field label="Computed Downtime" value={`${report.breach_minutes ?? 0} min`} />
                      <Field label="Source Usable" value={report.usable ? "yes" : "no"} />
                      <Field label="Relevant to Window" value={report.source_relevant ? "yes" : "no"} />
                      <Field label="Covered Service Match" value={report.covered_service_match ? "yes" : "no"} />
                    </div>
                    {report.source_summary && <p className="mt-3 text-sm text-on-surface-variant">{report.source_summary}</p>}
                    {(report.incidents ?? []).map((incident, incidentIndex) => (
                      <div key={incidentIndex} className="mt-3 border-l-2 border-outline-variant pl-3 text-xs text-on-surface-variant">
                        <p className="font-mono text-on-surface">{formatTs(incident.start_ts ?? 0)} → {formatTs(incident.end_ts ?? 0)} · {incident.service || "unidentified service"}</p>
                        <p>{incident.summary || "No incident summary supplied."}</p>
                        {incident.quotation && <p className="mt-1 italic">Evidence excerpt: “{incident.quotation}”</p>}
                        <p className="mt-1 font-mono">{incident.excluded ? `Excluded: ${incident.exclusion_reason || "matched the SLA exclusions"}` : "Included in breach calculation"}</p>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {challenge && (
            <Card>
              <h2 className="mb-4 font-display text-lg font-semibold text-on-surface">
                Challenge {challenge.challengeId}
              </h2>
              <div className="grid grid-cols-2 gap-4 font-mono text-sm md:grid-cols-4">
                <Field label="Challenger" value={shortAddress(challenge.challenger)} />
                <Field label="Additional Sources" value={String(challenge.additionalSources.length)} />
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
          {PROVISIONAL.includes(claim.status) && (
            <Card>
              <h2 className="mb-2 font-display text-lg font-semibold text-on-surface">
                Challenge Window
              </h2>
              <p className="mb-4 font-mono text-sm text-tertiary">
                {timeRemaining(Number(claim.challengeDeadlineTs))}
              </p>

              {!claim.isChallenged && isParty && now < Number(claim.challengeDeadlineTs) && claim.challengeCount < 1 && (
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
                    {pending ? "Submitting challenge…" : "File Evidence Challenge"}
                  </Button>
                </div>
              )}

              {!claim.isChallenged && now >= Number(claim.challengeDeadlineTs) && (
                <Button disabled={pending} onClick={handleFinalize}>
                  {pending ? "Finalizing…" : "Finalize GenLayer Ruling"}
                </Button>
              )}
            </Card>
          )}

          {claim.status === "CHALLENGED" && (
            <Card>
              <h2 className="mb-2 font-display text-lg font-semibold text-on-surface">Challenge Pending</h2>
              <p className="mb-4 text-sm text-on-surface-variant">The additive evidence set must be independently re-evaluated before the claim can return to a bounded finalization window.</p>
              <Button disabled={pending} onClick={handleResolveChallenge}>{pending ? "Re-adjudicating…" : "Trigger Re-Adjudication"}</Button>
            </Card>
          )}

          {GEN_FINALIZED.includes(claim.status) && !claim.finalized && (
            <Card>
              <h2 className="mb-2 font-display text-lg font-semibold text-on-surface">Base Settlement</h2>
              <p className="text-sm text-on-surface-variant">GenLayer is final. The authenticated relayer is reconciling the exact agreement, open claim, evidence digest, and USDC distribution on Base Sepolia.</p>
              <p className="mt-3 font-mono text-xs text-tertiary">State: {claim.settlementStatus || "NOT_READY"}</p>
              {claim.settlementProposedTx && <p className="mt-2 break-all font-mono text-xs text-on-surface-variant">Proposal: {claim.settlementProposedTx}</p>}
            </Card>
          )}

          {claim.finalized && (
            <Card>
              <p className="font-mono text-sm text-secondary">
                ✓ Base settlement executed and USDC transferred to the recipient wallets.
              </p>
              {claim.settlementExecutedTx && <p className="mt-2 break-all font-mono text-xs text-on-surface-variant">{claim.settlementExecutedTx}</p>}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className="font-mono text-[10px] uppercase text-on-surface-variant">{label}</span>
      <span className="break-words text-on-surface">{value}</span>
    </div>
  );
}
