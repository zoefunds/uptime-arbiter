const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ?? "";

export function SiteFooter() {
  return (
    <footer className="w-full border-t border-outline-variant bg-surface-container-lowest py-6">
      <div className="mx-auto flex w-full max-w-[1720px] flex-col items-center justify-between gap-3 px-4 md:flex-row lg:px-6">
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-on-surface-variant">© 2026 Uptime Arbiter Protocol</span>
          <span className="text-outline">•</span>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-secondary" />
            <span className="font-mono text-[10px] uppercase text-secondary">Equivalence Principle Active</span>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <a
            href={`https://explorer-studio.genlayer.com/address/${CONTRACT_ADDRESS}`}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-xs text-on-surface-variant transition-colors hover:text-primary"
          >
            Contract: {CONTRACT_ADDRESS.slice(0, 6)}...{CONTRACT_ADDRESS.slice(-4)}
          </a>
          <a
            href="https://docs.genlayer.com"
            target="_blank"
            rel="noreferrer"
            className="font-mono text-xs text-on-surface-variant transition-colors hover:text-primary"
          >
            GenLayer Docs
          </a>
        </div>
      </div>
    </footer>
  );
}
