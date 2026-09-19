import { Redis } from "ioredis";
import { config } from "../config.js";

// Single shared connection. ioredis auto-reconnects with backoff on drop —
// this is one of the two always-on pieces (the other is the indexer loop
// itself) that must survive transient network blips without the process
// exiting, per the "backend must never die" requirement.
export const redis = new Redis(config.redisUrl, {
  maxRetriesPerRequest: 3,
  retryStrategy(times: number) {
    return Math.min(times * 500, 10_000);
  },
  lazyConnect: false,
});

redis.on("error", (err: Error) => {
  // eslint-disable-next-line no-console
  console.error("[redis] connection error (will auto-retry):", err.message);
});
