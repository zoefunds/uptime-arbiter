"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { Card, Button } from "@/components/ui";
import { useBaseUsdcWrite } from "@/hooks/use-base-usdc-write";
import { useGenlayerWrite } from "@/hooks/use-genlayer-write";
import { usdcToUnits } from "@/lib/format";

const DAY = 24 * 3600;

// Real, live, publicly reachable status endpoints — genuine machine-readable
// evidence sources a GenLayer validator can actually fetch and parse, used
// here purely to make testing the form fast. Not fabricated placeholders.
const SAMPLE_SOURCES = [
  "https://www.githubstatus.com/api/v2/summary.json",
  "https://status.openai.com/api/v2/summary.json",
  "https://status.aws.amazon.com/rss/ec2-us-east-1.rss",
];

const SAMPLE_VALUES = {
  // A valid EVM address is included so the Base contract accepts the draft.
  // Replace it with the counterparty's Base Sepolia address before funding.
  customer: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  label: "GitHub Actions Runner Fleet (us-east-1)",
  coveredService: "GitHub Actions hosted runners (us-east-1)",
  targetUptimePct: "99.95",
  penaltyRate: "250",
  escrow: "50000",
  bond: "5000",
  challengeBond: "2500",
  tolerance: "2",
  challengeWindowHours: "72",
  termDays: "30",
  registrationTtlDays: "7",
  exclusionTerms:
    "Pre-announced scheduled maintenance windows, disclosed at least 24 hours in advance via the provider's status page, do not count toward breach minutes.",
};

export default function RegisterSlaPage() {
  const { address } = useAccount();
  const router = useRouter();
  const { send: sendBase, nextBaseAgreementId, waitForBaseReceipt, pending: basePending, error: baseError, txHash } = useBaseUsdcWrite();
  const { send: sendGenlayer, pending: adjudicationPending, error: adjudicationError } = useGenlayerWrite();
  const pending = basePending || adjudicationPending;
  const error = baseError ?? adjudicationError;

  const [customer, setCustomer] = useState("");
  const [label, setLabel] = useState("");
  const [coveredService, setCoveredService] = useState("");
  const [targetUptimePct, setTargetUptimePct] = useState("99.95");
  const [penaltyRate, setPenaltyRate] = useState("250");
  const [escrow, setEscrow] = useState("50000");
  const [bond, setBond] = useState("5000");
  const [challengeBond, setChallengeBond] = useState("2500");
  const [tolerance, setTolerance] = useState("2");
  const [challengeWindowHours, setChallengeWindowHours] = useState("72");
  const [termDays, setTermDays] = useState("30");
  const [registrationTtlDays, setRegistrationTtlDays] = useState("7");
  const [sources, setSources] = useState(["", "", ""]);
  const [exclusionTerms, setExclusionTerms] = useState("");
  const [done, setDone] = useState(false);

  // Mirrors the contract's own derivation exactly (propose_sla):
  // grace_minutes = term_minutes * (10000 - target_uptime_bps) // 10000.
  // Purely a UI preview — the contract computes the authoritative value
  // itself; this just avoids surprising the user at broadcast time.
  const targetBps = Math.round(Number(targetUptimePct) * 100);
  const termMinutes = Math.floor((Number(termDays) || 0) * DAY / 60);
  const derivedGraceMinutes =
    Number.isFinite(targetBps) && targetBps >= 0 && targetBps <= 10_000
      ? Math.floor((termMinutes * (10_000 - targetBps)) / 10_000)
      : 0;

  function updateSource(i: number, value: string) {
    setSources((prev) => prev.map((s, idx) => (idx === i ? value : s)));
  }

  function addSource() {
    if (sources.length < 8) setSources((prev) => [...prev, ""]);
  }

  function fillSampleData() {
    setCustomer(SAMPLE_VALUES.customer);
    setLabel(SAMPLE_VALUES.label);
    setCoveredService(SAMPLE_VALUES.coveredService);
    setTargetUptimePct(SAMPLE_VALUES.targetUptimePct);
    setPenaltyRate(SAMPLE_VALUES.penaltyRate);
    setEscrow(SAMPLE_VALUES.escrow);
    setBond(SAMPLE_VALUES.bond);
    setChallengeBond(SAMPLE_VALUES.challengeBond);
    setTolerance(SAMPLE_VALUES.tolerance);
    setChallengeWindowHours(SAMPLE_VALUES.challengeWindowHours);
    setTermDays(SAMPLE_VALUES.termDays);
    setRegistrationTtlDays(SAMPLE_VALUES.registrationTtlDays);
    setSources(SAMPLE_SOURCES);
    setExclusionTerms(SAMPLE_VALUES.exclusionTerms);
  }

  async function handleSubmit() {
    const cleanSources = sources.map((s) => s.trim()).filter(Boolean);
    if (cleanSources.length < 3) {
      alert("At least 3 evidence sources are required.");
      return;
    }
    if (!customer) {
      alert("Customer address is required.");
      return;
    }
    if (!coveredService.trim()) {
      alert("Covered service is required — validators use it to reject incidents about a different service.");
      return;
    }

    // Capital agreement is created on Base Sepolia first. The subsequent
    // GenLayer registration only binds evidence and adjudication metadata.
    const now = Math.floor(Date.now() / 1000);
    const baseAgreementId = await nextBaseAgreementId();
    const txId = await sendBase("propose", [customer, usdcToUnits(escrow), usdcToUnits(bond), BigInt(now + Number(registrationTtlDays) * DAY), BigInt(now + Number(termDays) * DAY)]);

    if (txId) {
      // Do not create an orphan adjudication record: GenLayer registration
      // happens only after Base confirms the exact agreement ID.
      await waitForBaseReceipt(txId);
      const adjudicationTx = await sendGenlayer("register_adjudication", [
        Number(baseAgreementId), customer, label || "Unlabeled SLA", coveredService.trim(),
        Math.round(Number(targetUptimePct) * 100), usdcToUnits(penaltyRate).toString(),
        usdcToUnits(escrow).toString(), now, now + Number(termDays) * DAY, cleanSources, exclusionTerms.trim(),
      ]);
      if (!adjudicationTx) return;
    }

    if (txId) {
      setDone(true);
      setTimeout(() => router.push("/registry"), 2500);
    }
  }

  if (!address) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-24 text-center lg:px-6">
        <p className="font-display text-xl text-on-surface">Connect a wallet to register an SLA.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 lg:px-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <span className="mb-1 block font-mono text-[10px] uppercase tracking-widest text-primary">
            Agreement Initialization
          </span>
          <h1 className="font-display text-2xl font-bold uppercase text-on-surface lg:text-3xl">
            Register Autonomous SLA Agreement
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-on-surface-variant">
            You propose the terms and pin the evidence sources now. The customer must separately
            co-sign and lock their bond before this SLA activates and escrow locks.
          </p>
        </div>
        <Button variant="secondary" onClick={fillSampleData} className="shrink-0">
          Fill Sample Data
        </Button>
      </div>

      <div className="rounded bg-surface-container-lowest px-4 py-3 font-mono text-xs text-on-surface-variant">
        &quot;Fill Sample Data&quot; uses live GitHub, OpenAI, and AWS status endpoints and a valid Base
        address, so its terms pass the contract&apos;s input validation. Replace the prefilled customer
        with your actual counterparty before funding: that address must approve and fund its USDC bond.
      </div>

      {error && <div className="rounded bg-error/10 px-4 py-3 font-mono text-xs text-error">{error}</div>}
      {done && (
        <div className="rounded bg-secondary/10 px-4 py-3 font-mono text-xs text-secondary">
          Base Sepolia escrow proposed ({txHash}) and its GenLayer adjudication agreement was registered.
        </div>
      )}

      <Card>
        <h2 className="mb-4 font-display text-lg font-semibold text-on-surface">
          1. Counterparty & Escrow
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <TextField label="Customer Address" value={customer} onChange={setCustomer} placeholder="0x..." />
          <TextField label="SLA Label" value={label} onChange={setLabel} placeholder="AWS us-east-1 RPC Cluster" />
          <TextField
            label="Covered Service"
            value={coveredService}
            onChange={setCoveredService}
            placeholder="e.g. Checkout API (payments-eu-west)"
          />
          <NumField label="Provider Escrow (USDC)" value={escrow} onChange={setEscrow} step="0.01" />
          <NumField label="Customer Bond (USDC)" value={bond} onChange={setBond} step="0.01" />
          <NumField label="Challenge Bond (USDC)" value={challengeBond} onChange={setChallengeBond} step="0.01" />
          <NumField label="Penalty Rate (USDC/min)" value={penaltyRate} onChange={setPenaltyRate} step="0.01" />
        </div>
      </Card>

      <Card>
        <h2 className="mb-4 font-display text-lg font-semibold text-on-surface">2. SLA Parameters</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <NumField label="Target Uptime (%)" value={targetUptimePct} onChange={setTargetUptimePct} step="0.01" />
          <NumField label="Equivalence Tolerance (minutes)" value={tolerance} onChange={setTolerance} />
          <NumField label="Challenge Window (hours)" value={challengeWindowHours} onChange={setChallengeWindowHours} />
          <NumField label="SLA Term (days)" value={termDays} onChange={setTermDays} />
          <NumField label="Registration Deadline (days)" value={registrationTtlDays} onChange={setRegistrationTtlDays} />
          <div className="flex flex-col gap-1">
            <span className="font-mono text-[10px] uppercase text-on-surface-variant">Derived Grace Budget</span>
            <span className="rounded bg-surface-container-lowest px-3 py-2 font-mono text-sm text-secondary">
              {derivedGraceMinutes} min over the term
            </span>
          </div>
        </div>
        <p className="mt-3 text-xs text-on-surface-variant">
          Grace is not a separate input — the contract derives it on-chain from Target Uptime and
          SLA Term (<code>term_minutes × (1 − target)</code>), so the stated uptime target always
          materially affects settlement instead of being decorative next to an independently-set
          grace value.
        </p>
      </Card>

      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-on-surface">
            3. Precommitted Evidence Sources ({sources.filter((s) => s.trim()).length}/{sources.length})
          </h2>
          <span className="font-mono text-[10px] uppercase text-on-surface-variant">Minimum 3 required</span>
        </div>
        <div className="flex flex-col gap-3">
          {sources.map((source, i) => (
            <TextField
              key={i}
              label={`Source ${String.fromCharCode(65 + i)}`}
              value={source}
              onChange={(v) => updateSource(i, v)}
              placeholder="https://status.example.com/api/v2/summary.json"
            />
          ))}
        </div>
        {sources.length < 8 && (
          <button
            onClick={addSource}
            className="mt-3 font-mono text-xs text-primary hover:underline"
          >
            + Add another source
          </button>
        )}
      </Card>

      <Card>
        <h2 className="mb-1 font-display text-lg font-semibold text-on-surface">
          4. Exclusion Terms (optional)
        </h2>
        <p className="mb-4 text-xs text-on-surface-variant">
          Natural-language carve-outs pinned alongside the evidence sources — e.g. pre-announced
          maintenance windows. Each validator reasons over this text against the fetched
          incident&apos;s own description; this is what makes evaluation genuinely interpretive
          rather than a number a script could parse out of a JSON field.
        </p>
        <textarea
          value={exclusionTerms}
          onChange={(e) => setExclusionTerms(e.target.value)}
          rows={3}
          placeholder="e.g. Pre-announced scheduled maintenance, disclosed at least 24 hours in advance, does not count as breach."
          className="w-full rounded bg-surface-container-lowest px-3 py-2 font-mono text-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </Card>

      <Button disabled={pending} onClick={handleSubmit} className="self-start">
        {pending ? "Creating Base escrow, then registering GenLayer adjudication…" : "Create Base Escrow & GenLayer Adjudication"}
      </Button>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-mono text-[10px] uppercase text-on-surface-variant">{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="rounded bg-surface-container-lowest px-3 py-2 font-mono text-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-primary"
      />
    </label>
  );
}

function NumField({
  label,
  value,
  onChange,
  step,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  step?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-mono text-[10px] uppercase text-on-surface-variant">{label}</span>
      <input
        type="number"
        step={step ?? "1"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded bg-surface-container-lowest px-3 py-2 font-mono text-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-primary"
      />
    </label>
  );
}
