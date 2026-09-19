import Link from "next/link";
import { StatsRibbon } from "@/components/stats-ribbon";

const PIPELINE = [
  {
    step: "01",
    title: "Escrow & Terms",
    body: "Provider and customer lock GEN escrow and sign an immutable SLA penalty schedule.",
    state: "LOCKED",
  },
  {
    step: "02",
    title: "Source Pinning",
    body: "Provider proposes evidence sources; customer must co-sign the exact fingerprint before activation.",
    state: "PINNED",
  },
  {
    step: "03",
    title: "Breach Claim",
    body: "Customer pins a claimed downtime window — the source list can never change after this point.",
    state: "PINNED",
  },
  {
    step: "04",
    title: "Independent Fetch",
    body: "Every GenLayer validator fetches every pinned source itself. No claimant-supplied evidence is ever trusted alone.",
    state: "CONSENSUS",
  },
  {
    step: "05",
    title: "Equivalence",
    body: "Validators compare a computed breach-minutes number within a tolerance band — never raw text or JSON.",
    state: "EQUIVALENCE",
  },
  {
    step: "06",
    title: "Deterministic Settlement",
    body: "A separate, non-AI function turns agreed breach-minutes into a GEN payout, capped at escrow.",
    state: "SETTLED",
  },
];

export default function LandingPage() {
  return (
    <div className="flex w-full flex-col">
      <section className="relative w-full overflow-hidden bg-surface-container-lowest px-4 py-16 lg:px-6 lg:py-24">
        <div className="pointer-events-none absolute left-1/2 top-1/4 h-80 w-[700px] -translate-x-1/2 rounded-full bg-primary/10 blur-[140px]" />
        <div className="relative mx-auto flex max-w-7xl flex-col items-center text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-surface-container-low px-4 py-1.5">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-secondary opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-secondary" />
            </span>
            <span className="font-mono text-[10px] uppercase tracking-widest text-on-surface">
              GenLayer-Powered Autonomous SLA Infrastructure
            </span>
          </div>

          <h1 className="mb-4 max-w-5xl font-display text-3xl font-bold uppercase tracking-tight text-on-surface lg:text-5xl">
            Two adversarial parties bet on the truth.
            <br />
            <span className="text-primary">The internet decides who&apos;s right.</span>
          </h1>

          <p className="mb-8 max-w-3xl text-sm leading-relaxed text-on-surface-variant lg:text-base">
            <strong className="font-semibold text-on-surface">Uptime Arbiter</strong> is an onchain
            SLA-breach adjudication protocol for infrastructure providers and their customers.
            Lock GEN escrow, precommit public evidence sources, and let decentralized GenLayer
            validators independently arbitrate downtime through deterministic consensus.
          </p>

          <div className="mb-16 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/register"
              className="flex items-center gap-2 rounded-lg bg-primary-container px-6 py-3 font-display text-sm font-semibold uppercase text-on-primary-container shadow-[0_0_20px_-3px_rgba(6,182,212,0.4)] transition-all hover:bg-primary"
            >
              Register an SLA
            </Link>
            <Link
              href="/registry"
              className="flex items-center gap-2 rounded-lg bg-surface-container-high px-6 py-3 font-display text-sm font-semibold uppercase text-on-surface transition-all hover:text-primary"
            >
              Browse SLA Registry
            </Link>
          </div>

          <div className="w-full rounded-xl bg-surface-container-low/70 p-6 text-left backdrop-blur-md lg:p-8">
            <div className="mb-6 flex flex-col justify-between gap-2 pb-6 sm:flex-row sm:items-center">
              <div>
                <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-primary">
                  State Machine Flow
                </div>
                <h2 className="font-display text-xl font-semibold text-on-surface">
                  6-Stage Cryptographic Dispute Lifecycle
                </h2>
              </div>
              <span className="font-mono text-xs text-on-surface-variant">
                Deterministic • Non-Custodial • Zero-Oracle Trust
              </span>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-6">
              {PIPELINE.map((item) => (
                <div
                  key={item.step}
                  className="flex flex-col rounded-lg bg-surface-container p-4 transition-colors hover:bg-surface-container-high"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <span className="rounded bg-primary/10 px-2 py-0.5 font-mono text-xs text-primary">
                      {item.step}
                    </span>
                  </div>
                  <h3 className="mb-1 font-display text-sm font-semibold text-on-surface">
                    {item.title}
                  </h3>
                  <p className="text-xs text-on-surface-variant">{item.body}</p>
                  <div className="mt-4 pt-2 font-mono text-[11px] text-on-surface-variant">
                    State: {item.state}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <StatsRibbon />

      <section className="w-full bg-surface-container-lowest px-4 py-16 lg:px-6 lg:py-20">
        <div className="mx-auto max-w-7xl">
          <span className="mb-1 block font-mono text-[10px] uppercase tracking-widest text-secondary">
            Architecture & Security Model
          </span>
          <h2 className="mb-3 font-display text-2xl font-bold uppercase text-on-surface lg:text-3xl">
            The Trust Boundary
          </h2>
          <p className="mb-10 max-w-3xl text-sm text-on-surface-variant">
            Uptime Arbiter avoids oracle centralization by leveraging GenLayer&apos;s native ability
            to perform non-deterministic web fetches and reach consensus on a single computed
            number — never on a claimant&apos;s word, never on a centralized backend&apos;s opinion.
          </p>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <TrustCard
              icon="lock_clock"
              title="Strict Additive Evidence"
              body="Neither party can swap or delete precommitted sources at dispute time. Challenges may only append bonded, named sources."
              footer="Invariant: source list immutable after activation"
            />
            <TrustCard
              icon="calculate"
              title="Equivalence on Numbers"
              body="Validators independently fetch every source and compare the computed breach-minutes number within a tolerance band."
              footer="Never raw text, never JSON shape"
            />
            <TrustCard
              icon="account_balance_wallet"
              title="Decoupled Settlement"
              body="A fully deterministic function — untouched by any LLM or validator — turns agreed breach-minutes into a capped GEN payout."
              footer="payout = breach_minutes × rate, capped at escrow"
            />
          </div>
        </div>
      </section>
    </div>
  );
}

function TrustCard({ title, body, footer }: { icon: string; title: string; body: string; footer: string }) {
  return (
    <div className="flex flex-col justify-between rounded-xl bg-surface-container-low p-6">
      <div>
        <h3 className="mb-2 font-display text-lg font-semibold text-on-surface">{title}</h3>
        <p className="text-sm text-on-surface-variant">{body}</p>
      </div>
      <div className="mt-6 rounded bg-surface-container-lowest/50 p-3">
        <span className="block font-mono text-xs text-primary">{footer}</span>
      </div>
    </div>
  );
}
