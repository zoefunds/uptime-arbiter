import { redis } from "./redis.js";
import { config } from "../config.js";

/**
 * Sliding-window rate limiter over Redis guarding every outbound call this
 * service makes to the GenLayer StudioNet RPC.
 *
 * WHY THIS EXISTS: StudioNet enforces a hard 30 requests/minute ceiling per
 * caller. This backend runs an always-on indexer loop PLUS serves live API
 * reads/relays — without a shared limiter, a burst (e.g. a page load that
 * triggers several reads while the indexer is mid-poll) can blow past that
 * ceiling and start getting rate-limited or banned by StudioNet, which is
 * exactly the kind of failure that would make the "backend must be 24/7"
 * requirement impossible to meet. The limiter lives in Redis (not
 * in-process memory) so it's correct even if this service scales to
 * multiple machines later — they all share one counter.
 *
 * We deliberately cap ourselves BELOW the real ceiling
 * (rpcRateLimitPerMinute - rpcRateLimitSafetyMargin) so a client-side clock
 * skew or an in-flight request race never actually trips StudioNet's own
 * limiter.
 */

const WINDOW_SECONDS = 60;
const KEY = "genlayer:rpc:window";

const effectiveLimit = Math.max(
  1,
  config.genlayer.rpcRateLimitPerMinute - config.genlayer.rpcRateLimitSafetyMargin,
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
 * limit that this service itself is responsible for respecting.
 */
export async function withRateLimit<T>(fn: () => Promise<T>): Promise<T> {
  let waited = 0;
  const maxWaitMs = 45_000;
  while (!(await tryAcquire())) {
    if (waited >= maxWaitMs) {
      throw new Error(
        "GenLayer RPC rate-limit queue exceeded max wait; StudioNet's 30/min ceiling is saturated",
      );
    }
    const backoff = 500 + Math.floor(Math.random() * 500);
    await sleep(backoff);
    waited += backoff;
  }
  return fn();
}
