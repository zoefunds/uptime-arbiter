import "dotenv/config";

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === "") {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 8080),
  nodeEnv: process.env.NODE_ENV ?? "development",

  databaseUrl: required("DATABASE_URL", "postgresql://localhost:5432/uptime_arbiter"),
  redisUrl: required("REDIS_URL"),

  jwtSecret: required("JWT_SIGNING_SECRET", "dev-only-insecure-secret-change-me"),
  sessionTtlSeconds: 60 * 60 * 24 * 7, // 7 days
  nonceTtlSeconds: 60 * 10, // 10 minutes to sign

  genlayer: {
    rpcUrl: required("GENLAYER_STUDIONET_RPC_URL", "https://studio.genlayer.com/api"),
    chainId: Number(process.env.GENLAYER_CHAIN_ID ?? 61999),
    networkAlias: process.env.GENLAYER_NETWORK_ALIAS ?? "studionet",
    contractAddress: required("NEXT_PUBLIC_CONTRACT_ADDRESS"),
    // GenLayer StudioNet's real ceiling, confirmed live from an actual RPC
    // error ("Rate limit exceeded: 500 requests per hour") — NOT a 30/min
    // limit as originally assumed from the project brief. The two are very
    // different shapes: 30/min sustained would be 1800/hour, so a limiter
    // built around a per-minute budget silently blew ~3x past the real
    // hourly ceiling and locked the indexer out entirely. See
    // lib/rateLimiter.ts, which now enforces a genuine 1-hour sliding
    // window against this number.
    rpcRateLimitPerHour: 500,
    rpcRateLimitSafetyMargin: 80, // stay at <= 420/hour from THIS service
  },

  indexer: {
    // At MAX_RPC_CALLS_PER_CYCLE = 6 in poll.ts, a 60s cycle interval caps
    // the indexer at 360 calls/hour ON ITS OWN — 86% of the 420/hour
    // effective limiter budget, leaving almost no headroom for live API
    // relay reads (per-user withdrawable-balance lookups, /protocol/stats)
    // sharing the same Redis limiter, and causing exactly the kind of
    // queuing/exhaustion the limiter was built to prevent. Widened to 180s:
    // worst case the indexer now spends 6 calls * 20 cycles/hour = 120
    // calls/hour, leaving 300/hour of real headroom for user-facing reads.
    // Nothing in the SLA lifecycle needs sub-3-minute sync latency — every
    // write path the frontend cares about (propose/fund/claim/challenge)
    // is read back live from the contract directly by genlayer-js at
    // write time; the indexer only needs to be fast enough for OTHER
        // viewers' registry/claims pages to pick it up, which 3 minutes is.
    pollIntervalMs: 180_000,
    // A non-terminal row (PROPOSED/ACTIVE SLA, open claim/challenge) is
    // only worth re-fetching if it's actually had time to change — without
    // this floor, refreshNonTerminal() in poll.ts re-spends its whole
    // budget every single cycle re-reading the same handful of rows over
    // and over even when nothing on-chain moved, which is pure waste
    // against a shared hourly ceiling. A row synced more recently than
    // this is skipped until it ages past the floor.
    minRefreshIntervalMs: 120_000,
    pageSize: 50,
    maxConsecutiveErrorsBeforeBackoff: 5,
    backoffMs: 60_000,
  },

  corsOrigins: (process.env.CORS_ORIGINS ?? "http://localhost:3000").split(","),
};
