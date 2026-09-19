"use client";

import { type ReactNode, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { createAppKit } from "@reown/appkit/react";
import { wagmiAdapter, reownProjectId } from "@/lib/wagmi";
import { studioNetChain } from "@/lib/chain";

const queryClient = new QueryClient();

let appKitInitialized = false;

function ensureAppKit() {
  if (appKitInitialized || !reownProjectId) return;
  appKitInitialized = true;
  createAppKit({
    adapters: [wagmiAdapter],
    networks: [studioNetChain],
    projectId: reownProjectId,
    metadata: {
      name: "Uptime Arbiter",
      description: "Onchain SLA-breach adjudication protocol on GenLayer",
      url: typeof window !== "undefined" ? window.location.origin : "https://uptime-arbiter.vercel.app",
      icons: ["/favicon.svg"],
    },
    features: { analytics: false, email: false, socials: [] },
    themeMode: "dark",
    themeVariables: {
      "--w3m-accent": "#4cd7f6",
      "--w3m-border-radius-master": "2px",
    },
  });
}

export function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    ensureAppKit();
  }, []);

  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
