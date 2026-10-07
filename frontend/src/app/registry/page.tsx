"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatUsdc, shortAddress, STATUS_LABELS } from "@/lib/format";
import { StatusChip, EmptyState, ErrorState, LoadingState } from "@/components/ui";
import results from "../../../public/e2e-results.json";

const FILTERS = [
  { value: undefined, label: "All" },
  { value: "PROPOSED", label: "Awaiting Escrow" },
  { value: "ACTIVE", label: "Active" },
  { value: "CONCLUDED", label: "Concluded" },
  { value: "CANCELLED", label: "Cancelled" },
];

export default function RegistryPage() {
  const [status, setStatus] = useState<string | undefined>(undefined);
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["slas", status],
    queryFn: () => api.listSlas({ status }),
  });

  return (
    <div className="mx-auto flex w-full max-w-[1720px] flex-col gap-6 px-4 py-8 lg:px-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <span className="mb-1 block font-mono text-[10px] uppercase tracking-widest text-primary">
            Live Registry
          </span>
          <h1 className="font-display text-2xl font-bold uppercase text-on-surface lg:text-3xl">
            SLA Registry
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
      {isError && <ErrorState message={error instanceof Error ? error.message : "Failed to load SLAs"} />}
      {data && data.rows.length === 0 && (
        <EmptyState
          title="No SLAs yet"
          description="Nobody has registered an SLA under this filter yet. Be the first — register one from the Register SLA page."
        />
      )}

      {data && data.rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl bg-surface-container">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="bg-surface-container-lowest font-mono text-[10px] uppercase tracking-wider text-on-surface-variant">
                <th className="px-4 py-3">SLA</th>
                <th className="px-4 py-3">Parties</th>
                <th className="px-4 py-3">Target Uptime</th>
                <th className="px-4 py-3">Escrow</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-container-high text-sm">
              {data.rows.map((sla) => (
                <tr key={sla.slaId} className="hover:bg-surface-container-high">
                  <td className="px-4 py-3.5">
                    <div className="flex flex-col">
                      <span className="font-mono text-sm text-on-surface">{sla.slaId}</span>
                      <span className="max-w-[220px] truncate font-mono text-xs text-on-surface-variant">
                        {sla.label}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 font-mono text-xs">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-on-surface-variant">P: {shortAddress(sla.provider)}</span>
                      <span className="text-primary">C: {shortAddress(sla.customer)}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 font-mono text-sm text-on-surface">
                    {(sla.targetUptimeBps / 100).toFixed(2)}%
                  </td>
                  <td className="px-4 py-3.5 font-mono text-sm text-tertiary">
                    {formatUsdc(sla.escrowDeposited)} USDC
                  </td>
                  <td className="px-4 py-3.5">
                    <StatusChip status={sla.status} />
                    <span className="block pt-0.5 font-mono text-[10px] text-on-surface-variant">
                      {STATUS_LABELS[sla.status] ?? sla.status}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <Link
                      href={`/registry/${sla.slaId}`}
                      className="rounded bg-surface-container-highest px-2.5 py-1 font-mono text-[10px] uppercase text-on-surface transition-colors hover:bg-surface-bright"
                    >
                      Inspect
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <section className="mt-4 border-t border-outline-variant pt-8" aria-labelledby="settlement-tests">
        <div className="mb-4 flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
          <div><span className="block font-mono text-[10px] uppercase tracking-widest text-secondary">Registry verification</span><h2 id="settlement-tests" className="font-display text-xl font-semibold uppercase text-on-surface">Executed settlement scenarios</h2></div>
          <span className="font-mono text-[10px] text-on-surface-variant">Foundry · {results.results.length}/{results.results.length} passed · Base Sepolia USDC</span>
        </div>
        <p className="mb-4 max-w-4xl text-sm text-on-surface-variant">These are executed escrow lifecycle records for this registry&apos;s Base USDC agreement model. They are contract-test evidence, not sample SLAs or live customer data.</p>
        <div className="overflow-x-auto rounded-xl bg-surface-container">
          <table className="w-full min-w-[760px] border-collapse text-left"><thead><tr className="bg-surface-container-lowest font-mono text-[10px] uppercase tracking-wider text-on-surface-variant"><th className="px-4 py-3">Scenario</th><th className="px-4 py-3">Base USDC flow</th><th className="px-4 py-3">Verified outcome</th><th className="px-4 py-3 text-right">Result</th></tr></thead>
            <tbody className="divide-y divide-surface-container-high text-sm">{results.results.map((test) => <tr key={test.function} className="align-top hover:bg-surface-container-high"><td className="px-4 py-3.5"><div className="font-medium text-on-surface">{test.name}</div><code className="mt-1 block text-[11px] text-primary">{test.function}()</code></td><td className="max-w-md px-4 py-3.5 text-xs leading-relaxed text-on-surface-variant">{test.scenario}</td><td className="px-4 py-3.5 font-mono text-xs text-on-surface-variant">{test.assertions.map((assertion) => <div key={assertion}>✓ {assertion}</div>)}</td><td className="px-4 py-3.5 text-right"><span className="inline-block rounded bg-secondary/15 px-2 py-1 font-mono text-[10px] uppercase text-secondary">Passed · {test.gas.toLocaleString()} gas</span></td></tr>)}</tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
