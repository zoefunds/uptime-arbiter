import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import { config } from "./config.js";
import { authRoutes } from "./routes/auth.js";
import { protocolRoutes } from "./routes/protocol.js";
import { healthRoutes } from "./routes/health.js";

// Prisma returns BigInt for the schema's BigInt columns (registrationDeadlineTs,
// termStartTs, termEndTs, windowStartTs, windowEndTs, challengeDeadlineTs).
// JSON.stringify throws on a raw BigInt ("Do not know how to serialize a
// BigInt") — every route that returns a Prisma row hits this the first time
// a row with those columns populated actually exists. Serializing as a
// decimal string (not a JS number) avoids precision loss for unix
// timestamps far in the future or past, and matches how every other u256
// value in this API is already represented (wei amounts are strings too).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

async function main() {
  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: config.corsOrigins,
    credentials: true,
  });
  await app.register(cookie);

  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(protocolRoutes);

  // Never let an unexpected error take the whole process down — log it,
  // return 500, keep serving. Combined with Fly's auto_restart + health
  // check, this is what keeps the API side of "must never die" true.
  app.setErrorHandler((err, _request, reply) => {
    app.log.error(err);
    reply.code(500).send({ error: "Internal server error" });
  });

  process.on("unhandledRejection", (reason) => {
    app.log.error({ reason }, "unhandled rejection (continuing)");
  });
  process.on("uncaughtException", (err) => {
    app.log.error({ err }, "uncaught exception (continuing)");
  });

  await app.listen({ port: config.port, host: "0.0.0.0" });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Fatal startup error:", err);
  process.exit(1);
});
