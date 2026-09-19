"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { Card, Button } from "@/components/ui";
import { useGenlayerWrite } from "@/hooks/use-genlayer-write";
import { genToWei } from "@/lib/format";

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
  label: "GitHub Actions Runner Fleet (us-east-1)",
  targetUptimePct: "99.95",
  graceMinutes: "21",
  penaltyRate: "250",
  escrow: "50000",
  bond: "5000",
  challengeBond: "2500",
  tolerance: "2",
  challengeWindowHours: "72",
  termDays: "30",
  registrationTtlDays: "7",
};

export default function RegisterSlaPage() {
  const { address } = useAccount();
  const router = useRouter();
  const { send, pending, error, txId } = useGenlayerWrite();

  const [customer, setCustomer] = useState("");
  const [label, setLabel] = useState("");
  const [targetUptimePct, setTargetUptimePct] = useState("99.95");
  const [graceMinutes, setGraceMinutes] = useState("21");
  const [penaltyRate, setPenaltyRate] = useState("250");
  const [escrow, setEscrow] = useState("50000");
  const [bond, setBond] = useState("5000");
  const [challengeBond, setChallengeBond] = useState("2500");
  const [tolerance, setTolerance] = useState("2");
  const [challengeWindowHours, setChallengeWindowHours] = useState("72");
  const [termDays, setTermDays] = useState("30");
  const [registrationTtlDays, setRegistrationTtlDays] = useState("7");
  const [sources, setSources] = useState(["", "", ""]);
  const [done, setDone] = useState(false);

  function updateSource(i: number, value: string) {
    setSources((prev) => prev.map((s, idx) => (idx === i ? value : s)));
  }

  function addSource() {
    if (sources.length < 8) setSources((prev) => [...prev, ""]);
  }

  function fillSampleData() {
    setLabel(SAMPLE_VALUES.label);
    setTargetUptimePct(SAMPLE_VALUES.targetUptimePct);
    setGraceMinutes(SAMPLE_VALUES.graceMinutes);
    setPenaltyRate(SAMPLE_VALUES.penaltyRate);
    setEscrow(SAMPLE_VALUES.escrow);
    setBond(SAMPLE_VALUES.bond);
    setChallengeBond(SAMPLE_VALUES.challengeBond);
    setTolerance(SAMPLE_VALUES.tolerance);
    setChallengeWindowHours(SAMPLE_VALUES.challengeWindowHours);
    setTermDays(SAMPLE_VALUES.termDays);
    setRegistrationTtlDays(SAMPLE_VALUES.registrationTtlDays);
    setSources(SAMPLE_SOURCES);
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

    const txId = await send("propose_sla", [
      customer,
      label || "Unlabeled SLA",
      Math.round(Number(targetUptimePct) * 100),
      Number(graceMinutes),
      genToWei(penaltyRate).toString(),
      genToWei(escrow).toString(),
      genToWei(bond).toString(),
      genToWei(challengeBond).toString(),
      Number(tolerance),
      Number(challengeWindowHours) * 3600,
      Number(termDays) * DAY,
      Number(registrationTtlDays) * DAY,
      cleanSources,
    ]);

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
        &quot;Fill Sample Data&quot; fills every field except <strong className="text-on-surface">Customer
        Address</strong> — that one has to be a real wallet you control (a second account in your
        wallet extension works), since it&apos;s who will be required to co-sign and can later
        withdraw claim payouts. The three evidence sources it fills in are real, live public status
        endpoints (GitHub, OpenAI, AWS), not placeholders.
      </div>

      {error && <div className="rounded bg-error/10 px-4 py-3 font-mono text-xs text-error">{error}</div>}
      {done && (
        <div className="rounded bg-secondary/10 px-4 py-3 font-mono text-xs text-secondary">
          SLA proposed — transaction finalized ({txId}). Redirecting to the registry…
        </div>
      )}

      <Card>
        <h2 className="mb-4 font-display text-lg font-semibold text-on-surface">
          1. Counterparty & Escrow
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <TextField label="Customer Address" value={customer} onChange={setCustomer} placeholder="0x..." />
          <TextField label="SLA Label" value={label} onChange={setLabel} placeholder="AWS us-east-1 RPC Cluster" />
          <NumField label="Provider Escrow (GEN)" value={escrow} onChange={setEscrow} />
          <NumField label="Customer Bond (GEN)" value={bond} onChange={setBond} />
          <NumField label="Challenge Bond (GEN)" value={challengeBond} onChange={setChallengeBond} />
          <NumField label="Penalty Rate (GEN/min)" value={penaltyRate} onChange={setPenaltyRate} />
        </div>
      </Card>

      <Card>
        <h2 className="mb-4 font-display text-lg font-semibold text-on-surface">2. SLA Parameters</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <NumField label="Target Uptime (%)" value={targetUptimePct} onChange={setTargetUptimePct} step="0.01" />
          <NumField label="Grace (minutes)" value={graceMinutes} onChange={setGraceMinutes} />
          <NumField label="Equivalence Tolerance (minutes)" value={tolerance} onChange={setTolerance} />
          <NumField label="Challenge Window (hours)" value={challengeWindowHours} onChange={setChallengeWindowHours} />
          <NumField label="SLA Term (days)" value={termDays} onChange={setTermDays} />
          <NumField label="Registration Deadline (days)" value={registrationTtlDays} onChange={setRegistrationTtlDays} />
        </div>
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

      <Button disabled={pending} onClick={handleSubmit} className="self-start">
        {pending ? "Broadcasting to StudioNet…" : "Propose SLA"}
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
