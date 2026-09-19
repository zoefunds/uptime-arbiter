"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatTs, STATUS_LABELS } from "@/lib/format";
import { StatusChip, EmptyState, ErrorState, LoadingState } from "@/components/ui";

const FILTERS = [
  { value: undefined, label: "All" },
  { value: "PINNED", label: "Evaluating" },
  { value: "RESOLVED_BREACH", label: "Breach" },
  { value: "RESOLVED_PARTIAL", label: "Partial" },
  { value: "RESOLVED_NO_BREACH", label: "No Breach" },
  { value: "INCONCLUSIVE", label: "Inconclusive" },
];

export default function ClaimsPage() {
  const [status, setStatus] = useState<string | undefined>(undefined);
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["claims", status],
    queryFn: () => api.listClaims({ status }),
    refetchInterval: 10_000,
  });

  return (
    <div className="mx-auto flex w-full max-w-[1720px] flex-col gap-6 px-4 py-8 lg:px-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <span className="mb-1 block font-mono text-[10px] uppercase tracking-widest text-primary">
            Consensus Log
          </span>
          <h1 className="font-display text-2xl font-bold uppercase text-on-surface lg:text-3xl">
            Adjudication Room
          </h1>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.label}
              onClick={() => setStatus(f.value)}
              className={`rounded px-3 py-1.5 font-mono text-[10px] uppercase transition-colors ${
                status === f.value
                  ? "bg-primary text-on-primary"
                  : "bg-surface-container-high text-on-surface-variant hover:text-on-surface"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading && <LoadingState />}
      {isError && <ErrorState message={error instanceof Error ? error.message : "Failed to load claims"} />}
      {data && data.rows.length === 0 && (
        <EmptyState
          title="No claims yet"
          description="No breach claim has been submitted under this filter. Claims are filed from an active SLA's detail page."
        />
      )}

      {data && data.rows.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.rows.map((claim) => (
            <Link
              key={claim.claimId}
              href={`/claims/${claim.claimId}`}
              className="flex flex-col gap-3 rounded-xl bg-surface-container-low p-5 transition-colors hover:bg-surface-container"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm text-primary">{claim.claimId}</span>
                <StatusChip status={claim.status} />
              </div>
              <span className="font-mono text-xs text-on-surface-variant">SLA: {claim.slaId}</span>
              <span className="font-mono text-xs text-on-surface-variant">
                {formatTs(claim.windowStartTs)} → {formatTs(claim.windowEndTs)}
              </span>
              {claim.status !== "PINNED" && (
                <span className="font-mono text-xs text-on-surface">
                  {STATUS_LABELS[claim.status] ?? claim.status} · {claim.breachMinutes} min
                </span>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
