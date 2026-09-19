import { redis } from "./redis.js";
import { config } from "../config.js";

/**
 * Sliding-window rate limiter over Redis guarding every outbound call this
 * service makes to the GenLayer StudioNet RPC.
 *
 * WHY THIS EXISTS: StudioNet enforces a hard ceiling — confirmed live via
 * an actual RPC error response as "Rate limit exceeded: 500 requests per
 * hour" (an earlier version of this limiter assumed a 30/min ceiling from
 * the project brief, which is a very different shape: 30/min sustained is
 * 1800/hour, nearly 4x the real limit, and silently starved the indexer
 * out entirely once it tripped). This backend runs an always-on indexer
 * loop PLUS serves live API reads/relays — without a shared limiter, the
 * two together can blow past StudioNet's ceiling and get this service's IP
 * throttled, which is exactly the kind of failure that would make the
 * "backend must be 24/7" requirement impossible to meet. The limiter lives
 * in Redis (not in-process memory) so it stays correct even if this
 * service scales to multiple machines later — they all share one counter.
 *
 * We deliberately cap ourselves BELOW the real ceiling
 * (rpcRateLimitPerHour - rpcRateLimitSafetyMargin) so clock skew or an
 * in-flight request race never actually trips StudioNet's own limiter.
 */

const WINDOW_SECONDS = 3600;
const KEY = "genlayer:rpc:window";

const effectiveLimit = Math.max(
  1,
  config.genlayer.rpcRateLimitPerHour - config.genlayer.rpcRateLimitSafetyMargin,
);

async function tryAcquire(): Promise<boolean> {
  const now = Date.now();
  const windowStart = now - WINDOW_SECONDS * 1000;

  const pipeline = redis.multi();
  pipeline.zremrangebyscore(KEY, 0, windowStart);
  pipeline.zcard(KEY);
  const results = await pipeline.exec();
  const count = (results?.[1]?.[1] as number) ?? 0;

  if (count >= effectiveLimit) {
    return false;
  }

  await redis.zadd(KEY, now, `${now}-${Math.random().toString(36).slice(2)}`);
  await redis.expire(KEY, WINDOW_SECONDS + 5);
  return true;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Runs `fn` only once a slot under the shared rate limit is available.
 * Blocks (with backoff) rather than rejecting — callers are internal
 * (indexer, API relay routes), not end users, so queuing is the correct
 * behavior: nothing here should ever surface a 429 to the frontend for a
 * limit that this service itself is responsible for respecting. The max
 * wait is generous (5 minutes) because the window this now queues against
 * is an hour wide, not a minute — a burst that saturates the budget needs
 * real time to drain, and failing fast here would just move the same
 * "cycle failed" error the hourly ceiling was already causing.
 */
export async function withRateLimit<T>(fn: () => Promise<T>): Promise<T> {
  let waited = 0;
  const maxWaitMs = 5 * 60_000;
  while (!(await tryAcquire())) {
    if (waited >= maxWaitMs) {
      throw new Error(
        "GenLayer RPC rate-limit queue exceeded max wait; StudioNet's hourly ceiling is saturated",
      );
    }
    const backoff = 2_000 + Math.floor(Math.random() * 2_000);
    await sleep(backoff);
    waited += backoff;
  }
  return fn();
}
