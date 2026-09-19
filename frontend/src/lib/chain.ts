import { defineChain } from "viem";

// GenLayer StudioNet, defined as a standard EVM chain for wallet-connection
// purposes (MetaMask/Rainbow/etc. need a chain definition to add the
// network and sign messages against the right chain id). Contract reads and
// writes themselves go through genlayer-js's own `studionet` chain
// definition (src/lib/genlayer.ts) — this one is only for wagmi/AppKit's
// wallet-connection layer.
export const studioNetChain = defineChain({
  id: Number(process.env.NEXT_PUBLIC_GENLAYER_CHAIN_ID ?? 61999),
  name: "GenLayer StudioNet",
  nativeCurrency: { name: "GenLayer", symbol: "GEN", decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.NEXT_PUBLIC_GENLAYER_RPC_URL ?? "https://studio.genlayer.com/api"] },
  },
  blockExplorers: {
    default: { name: "GenLayer Studio Explorer", url: "https://explorer-studio.genlayer.com" },
  },
  testnet: true,
});
