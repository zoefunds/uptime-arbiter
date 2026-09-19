"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { Logo } from "./logo";
import { ConnectButton } from "./connect-button";

const NAV = [
  { href: "/registry", label: "SLA Registry" },
  { href: "/register", label: "Register SLA" },
  { href: "/claims", label: "Adjudication Room" },
  { href: "/vault", label: "Vault & Settlements" },
];

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="fixed top-0 z-50 w-full border-b border-outline-variant bg-surface-container-lowest/90 backdrop-blur-xl">
      <div className="flex h-16 w-full items-center justify-between gap-4 px-4 lg:px-6">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-3">
            <Logo className="h-8 w-8" />
            <div className="flex items-center gap-1.5">
              <span className="font-display text-sm font-semibold uppercase tracking-wider text-on-surface">
                Uptime Arbiter
              </span>
              <span className="rounded border border-outline-variant bg-surface-container-high px-1.5 py-0.5 font-mono text-[10px] uppercase text-primary">
                StudioNet
              </span>
            </div>
          </Link>

          <nav className="hidden items-center gap-1 xl:flex">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  "flex h-16 items-center border-b-2 px-3 text-sm transition-colors",
                  pathname?.startsWith(item.href)
                    ? "border-primary bg-surface-container-high font-semibold text-primary"
                    : "border-transparent text-on-surface-variant hover:bg-surface-container hover:text-on-surface",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        <ConnectButton />
      </div>
    </header>
  );
}
