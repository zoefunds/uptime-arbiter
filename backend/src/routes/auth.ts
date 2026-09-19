import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { issueNonce, verifySiwe, refreshSession, revokeSession, verifyAccessToken } from "../auth/siwe.js";
import { config } from "../config.js";

const nonceSchema = z.object({ address: z.string().min(4) });
const verifySchema = z.object({ message: z.string().min(10), signature: z.string().min(10) });

export async function authRoutes(app: FastifyInstance) {
  app.post("/auth/nonce", async (request, reply) => {
    const parsed = nonceSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid address" });
    const nonce = await issueNonce(parsed.data.address);
    return { nonce };
  });

  app.post("/auth/verify", async (request, reply) => {
    const parsed = verifySchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid request body" });

    try {
      const result = await verifySiwe(parsed.data.message, parsed.data.signature);
      reply.setCookie("uptime_arbiter_refresh", result.refreshToken, {
        httpOnly: true,
        secure: config.nodeEnv === "production",
        sameSite: "lax",
        path: "/auth",
        expires: result.expiresAt,
      });
      return { address: result.address, accessToken: result.accessToken };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Verification failed";
      return reply.code(401).send({ error: message });
    }
  });

  app.post("/auth/refresh", async (request, reply) => {
    const refreshToken = request.cookies?.uptime_arbiter_refresh;
    if (!refreshToken) return reply.code(401).send({ error: "No session" });

    try {
      const result = await refreshSession(refreshToken);
      return { address: result.address, accessToken: result.accessToken };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Session refresh failed";
      return reply.code(401).send({ error: message });
    }
  });

  app.post("/auth/logout", async (request, reply) => {
    const refreshToken = request.cookies?.uptime_arbiter_refresh;
    if (refreshToken) await revokeSession(refreshToken);
    reply.clearCookie("uptime_arbiter_refresh", { path: "/auth" });
    return { ok: true };
  });

  app.get("/auth/me", async (request, reply) => {
    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer ")) return reply.code(401).send({ error: "Missing token" });
    try {
      const { address } = verifyAccessToken(header.slice("Bearer ".length));
      return { address };
    } catch {
      return reply.code(401).send({ error: "Invalid or expired token" });
    }
  });
}
