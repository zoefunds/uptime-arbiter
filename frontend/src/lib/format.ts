const USDC_UNIT = 1_000_000n; // USDC has 6 decimals on Base

export function formatUsdc(units: string | bigint, maxDecimals = 2): string {
  const value = typeof units === "bigint" ? units : BigInt(units || "0");
  const whole = value / USDC_UNIT;
  const fraction = value % USDC_UNIT;
  const fractionStr = fraction.toString().padStart(6, "0").slice(0, maxDecimals);
  const trimmed = fractionStr.replace(/0+$/, "");
  const wholeStr = whole.toLocaleString("en-US");
  return trimmed ? `${wholeStr}.${trimmed}` : wholeStr;
}

export function usdcToUnits(usdc: string): bigint {
  if (!usdc || Number.isNaN(Number(usdc))) return 0n;
  const [whole, fraction = ""] = usdc.split(".");
  const fractionPadded = (fraction + "0".repeat(6)).slice(0, 6);
  return BigInt(whole || "0") * USDC_UNIT + BigInt(fractionPadded || "0");
}

export function formatTs(ts: string | number): string {
  const n = typeof ts === "string" ? Number(ts) : ts;
  if (!n) return "—";
  return new Date(n * 1000).toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

export function shortAddress(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function timeRemaining(targetTs: number): string {
  const now = Math.floor(Date.now() / 1000);
  const delta = targetTs - now;
  if (delta <= 0) return "closed";
  const days = Math.floor(delta / 86400);
  const hours = Math.floor((delta % 86400) / 3600);
  const minutes = Math.floor((delta % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h remaining`;
  if (hours > 0) return `${hours}h ${minutes}m remaining`;
  return `${minutes}m remaining`;
}

export const STATUS_LABELS: Record<string, string> = {
  PROPOSED: "Awaiting Escrow",
  ACTIVE: "Active",
  CONCLUDED: "Concluded",
  CANCELLED: "Cancelled",
  PINNED: "Evaluating",
  RESOLVED_BREACH: "Breach Confirmed",
  RESOLVED_PARTIAL: "Partial Breach",
  RESOLVED_NO_BREACH: "No Breach",
  INCONCLUSIVE: "Inconclusive",
};
