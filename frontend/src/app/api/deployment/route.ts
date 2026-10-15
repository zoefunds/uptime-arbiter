import { NextResponse } from "next/server";
import { BASE_ESCROW_ADDRESS, BASE_SEPOLIA_USDC } from "@/lib/base";
import { CONTRACT_ADDRESS } from "@/lib/genlayer";

/** Public, cache-resistant deployment manifest for reviewers and wallet clients. */
export function GET() {
  return NextResponse.json(
    {
      network: "GenLayer StudioNet + Base Sepolia",
      genlayer: {
        version: "0.10.0",
        address: CONTRACT_ADDRESS,
        explorer: `https://explorer-studio.genlayer.com/address/${CONTRACT_ADDRESS}`,
      },
      baseEscrow: {
        version: "0.8.0",
        address: BASE_ESCROW_ADDRESS,
        explorer: `https://sepolia.basescan.org/address/${BASE_ESCROW_ADDRESS}`,
      },
      baseUsdc: BASE_SEPOLIA_USDC,
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
