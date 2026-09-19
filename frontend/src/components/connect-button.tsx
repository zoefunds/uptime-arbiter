"use client";

import { shortAddress } from "@/lib/format";

// Reown AppKit's <appkit-button> web component handles connect/disconnect/
// account-switch UI itself once createAppKit() has run (see providers.tsx).
// This wrapper just gives it our design-system sizing via CSS variables so
// it doesn't look like a foreign widget dropped into the header.
export function ConnectButton() {
  return (
    <appkit-button balance="hide" />
  );
}

export function InlineAddress({ address }: { address: string }) {
  return <span className="font-mono text-xs text-on-surface">{shortAddress(address)}</span>;
}
