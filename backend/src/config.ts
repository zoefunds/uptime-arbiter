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
    // GenLayer StudioNet enforces a 30 requests/minute RPC ceiling. Every
    // outbound RPC call in this service — indexer reads AND any relayed
    // reads from the API — goes through lib/rateLimiter.ts, which caps
    // itself below this with headroom for the frontend's own direct reads.
    rpcRateLimitPerMinute: 30,
    rpcRateLimitSafetyMargin: 6, // stay at <= 24/min from THIS service
  },

  indexer: {
    pollIntervalMs: 15_000,
    pageSize: 50,
    maxConsecutiveErrorsBeforeBackoff: 5,
    backoffMs: 60_000,
  },

  corsOrigins: (process.env.CORS_ORIGINS ?? "http://localhost:3000").split(","),
};
