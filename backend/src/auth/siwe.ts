import { SiweMessage, generateNonce } from "siwe";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { prisma } from "../db/client.js";
import { config } from "../config.js";

/**
 * Wallet-based auth. No private keys ever touch this backend — the flow is:
 *   1. Frontend calls POST /auth/nonce { address } -> we mint and store a
 *      single-use nonce.
 *   2. User signs a SIWE message (EIP-4361) containing that nonce with
 *      their connected wallet.
 *   3. Frontend calls POST /auth/verify { message, signature } -> we verify
 *      the signature against the message, confirm the nonce is ours and
 *      unused, mark it used, and mint a session (JWT access token +
 *      opaque refresh token stored server-side so it can be revoked).
 */

export async function issueNonce(address: string): Promise<string> {
  const nonce = generateNonce();
  await prisma.nonce.create({
    data: { address: address.toLowerCase(), nonce },
  });
  return nonce;
}

interface VerifyResult {
  address: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

export async function verifySiwe(messageText: string, signature: string): Promise<VerifyResult> {
  const siweMessage = new SiweMessage(messageText);
  const verification = await siweMessage.verify({ signature });

  if (!verification.success) {
    throw new Error("Invalid signature");
  }

  const address = siweMessage.address.toLowerCase();
  const nonceRow = await prisma.nonce.findUnique({ where: { nonce: siweMessage.nonce } });

  if (!nonceRow || nonceRow.usedAt || nonceRow.address !== address) {
    throw new Error("Unknown, expired, or already-used nonce");
  }

  const nonceAgeSeconds = (Date.now() - nonceRow.createdAt.getTime()) / 1000;
  if (nonceAgeSeconds > config.nonceTtlSeconds) {
    throw new Error("Nonce has expired — request a new one");
  }

  await prisma.nonce.update({ where: { id: nonceRow.id }, data: { usedAt: new Date() } });

  const expiresAt = new Date(Date.now() + config.sessionTtlSeconds * 1000);
  const refreshToken = randomUUID() + randomUUID();

  await prisma.session.create({
    data: { address, refreshToken, expiresAt },
  });

  const accessToken = jwt.sign({ sub: address }, config.jwtSecret, {
    expiresIn: "15m",
  });

  return { address, accessToken, refreshToken, expiresAt };
}

export async function refreshSession(refreshToken: string): Promise<VerifyResult> {
  const session = await prisma.session.findUnique({ where: { refreshToken } });
  if (!session || session.revokedAt || session.expiresAt < new Date()) {
    throw new Error("Invalid or expired session");
  }

  const accessToken = jwt.sign({ sub: session.address }, config.jwtSecret, {
    expiresIn: "15m",
  });

  return {
    address: session.address,
    accessToken,
    refreshToken: session.refreshToken,
    expiresAt: session.expiresAt,
  };
}

export async function revokeSession(refreshToken: string): Promise<void> {
  await prisma.session.updateMany({
    where: { refreshToken },
    data: { revokedAt: new Date() },
  });
}

export function verifyAccessToken(token: string): { address: string } {
  const payload = jwt.verify(token, config.jwtSecret) as { sub: string };
  return { address: payload.sub };
}
