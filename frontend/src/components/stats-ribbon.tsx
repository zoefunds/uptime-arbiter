"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatGen } from "@/lib/format";

export function StatsRibbon() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["protocol-stats"],
    queryFn: () => api.protocolStats(),
    refetchInterval: 20_000,
  });

  const cells = [
    { label: "Capital in Escrow", value: data ? `${formatGen(data.total_active_escrow_wei ?? "0")} GEN` : "—" },
    { label: "SLAs Registered", value: data?.total_slas_registered ?? "—" },
    { label: "Active SLAs", value: data?.total_slas_active ?? "—" },
    { label: "Claims Submitted", value: data?.total_claims_submitted ?? "—" },
    { label: "Breaches Confirmed", value: data?.total_claims_resolved_breach ?? "—" },
    { label: "Challenges Filed", value: data?.total_challenges_filed ?? "—" },
  ];

  return (
    <section className="w-full bg-surface-container-low py-6">
      <div className="mx-auto max-w-7xl px-4 lg:px-6">
        {isError ? (
          <p className="text-center font-mono text-xs text-on-surface-variant">
            Live stats temporarily unavailable — backend indexer may be starting up.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-6 md:grid-cols-3 lg:grid-cols-6">
            {cells.map((cell) => (
              <div key={cell.label} className="flex flex-col">
                <span className="mb-1 font-mono text-[10px] uppercase tracking-wider text-on-surface-variant">
                  {cell.label}
                </span>
                <span className="font-mono text-xl font-semibold text-primary">
                  {isLoading ? "…" : cell.value}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
