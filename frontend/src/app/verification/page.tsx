import results from "../../../public/e2e-results.json";

export default function VerificationPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 lg:px-6">
      <span className="mb-1 block font-mono text-[10px] uppercase tracking-widest text-secondary">Executed contract evidence</span>
      <h1 className="font-display text-2xl font-bold uppercase text-on-surface lg:text-3xl">Settlement verification</h1>
      <p className="mt-3 max-w-3xl text-sm leading-relaxed text-on-surface-variant">
        These are the recorded results of the repository&apos;s three executed end-to-end escrow tests—not seeded protocol data. They use the deployed Base escrow bytecode and install a local USDC implementation at Base Sepolia&apos;s canonical USDC address so every approval, deposit, transfer, and settlement path is exercised.
      </p>
      <div className="mt-4 rounded-lg bg-surface-container-low p-4 font-mono text-xs text-on-surface-variant">
        <div>Runner: {results.runner}</div>
        <div>Executed: {new Date(results.generatedAt).toLocaleString("en-GB", { timeZone: "UTC", timeZoneName: "short" })}</div>
        <div className="break-all">USDC: {results.canonicalUsdcAddress}</div>
      </div>
      <div className="mt-6 grid gap-4">
        {results.results.map((test) => (
          <article key={test.function} className="rounded-xl bg-surface-container-low p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-semibold text-on-surface">{test.name}</h2>
                <code className="mt-1 block text-xs text-primary">{test.function}()</code>
              </div>
              <span className="rounded bg-secondary/15 px-2 py-1 font-mono text-xs uppercase text-secondary">{test.status} · {test.gas.toLocaleString()} gas</span>
            </div>
            <p className="mt-4 text-sm text-on-surface-variant">{test.scenario}</p>
            <ul className="mt-4 space-y-1 font-mono text-xs text-on-surface">
              {test.assertions.map((assertion) => <li key={assertion}>✓ {assertion}</li>)}
            </ul>
          </article>
        ))}
      </div>
    </div>
  );
}
