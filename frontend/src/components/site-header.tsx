"use client";

import { useState } from "react";
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
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="fixed top-0 z-50 w-full border-b border-outline-variant bg-surface-container-lowest/90 backdrop-blur-xl">
      <div className="flex h-16 w-full items-center justify-between gap-2 px-4 lg:px-6">
        <div className="flex min-w-0 items-center gap-4 xl:gap-8">
          <Link href="/" className="flex min-w-0 items-center gap-2 sm:gap-3">
            <Logo className="h-8 w-8 shrink-0" />
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="truncate font-display text-sm font-semibold uppercase tracking-wider text-on-surface">
                Uptime Arbiter
              </span>
              <span className="hidden shrink-0 rounded border border-outline-variant bg-surface-container-high px-1.5 py-0.5 font-mono text-[10px] uppercase text-primary sm:inline-block">
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

        <div className="flex shrink-0 items-center gap-2">
          <ConnectButton />
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            className="flex h-9 w-9 items-center justify-center rounded bg-surface-container-high text-on-surface xl:hidden"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              {menuOpen ? (
                <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
              ) : (
                <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {menuOpen && (
        <nav className="flex flex-col border-t border-outline-variant bg-surface-container-lowest xl:hidden">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMenuOpen(false)}
              className={clsx(
                "border-l-2 px-4 py-3 text-sm transition-colors",
                pathname?.startsWith(item.href)
                  ? "border-primary bg-surface-container-high font-semibold text-primary"
                  : "border-transparent text-on-surface-variant hover:bg-surface-container hover:text-on-surface",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
