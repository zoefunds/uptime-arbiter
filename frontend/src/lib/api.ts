const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export interface SlaRow {
  slaId: string;
  provider: string;
  customer: string;
  label: string;
  targetUptimeBps: number;
  graceMinutes: number;
  penaltyRateWeiPerMin: string;
  escrowWei: string;
  escrowDeposited: string;
  bondWei: string;
  bondDeposited: string;
  challengeBondWei: string;
  toleranceMinutes: number;
  challengeWindowSeconds: number;
  termSeconds: number;
  evidenceSources: string[];
  exclusionTerms: string;
  sourceDigest: string;
  adjudicatedWindows: string[];
  status: string;
  providerFunded: boolean;
  customerSigned: boolean;
  createdAt: string;
  registrationDeadlineTs: string;
  termStartTs: string;
  termEndTs: string;
  activeClaimId: string;
}

export interface ClaimRow {
  claimId: string;
  slaId: string;
  claimant: string;
  windowStartTs: string;
  windowEndTs: string;
  pinnedSources: string[];
  pinnedSourceDigest: string;
  submittedAt: string;
  status: string;
  breachMinutes: number;
  inconclusiveReason: string;
  recommendedPayoutBps: number;
  payoutWei: string;
  resolvedAt: string;
  challengeDeadlineTs: string;
  challengeCount: number;
  activeChallengeId: string;
  isChallenged: boolean;
  finalized: boolean;
}

export interface ChallengeRow {
  challengeId: string;
  claimId: string;
  challenger: string;
  additionalSources: string[];
  rationale: string;
  bondWei: string;
  bondDeposited: string;
  filedAt: string;
  resolved: boolean;
  outcome: string;
  resolvedAt: string;
  priorBreachMinutes: number;
  newBreachMinutes: number;
}

export const api = {
  protocolConfig: () =>
    request<{ contractAddress: string; networkAlias: string; chainId: number; rpcUrl: string }>(
      "/protocol/config",
    ),
  protocolStats: () => request<Record<string, string>>("/protocol/stats"),

  listSlas: (params: { status?: string; page?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.status) qs.set("status", params.status);
    if (params.page) qs.set("page", String(params.page));
    return request<{ rows: SlaRow[]; total: number; page: number; pageSize: number }>(
      `/slas?${qs.toString()}`,
    );
  },
  getSla: (slaId: string) => request<{ sla: SlaRow; claims: ClaimRow[] }>(`/slas/${slaId}`),

  listClaims: (params: { status?: string; slaId?: string; claimant?: string; page?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.status) qs.set("status", params.status);
    if (params.slaId) qs.set("slaId", params.slaId);
    if (params.claimant) qs.set("claimant", params.claimant);
    if (params.page) qs.set("page", String(params.page));
    return request<{ rows: ClaimRow[]; total: number; page: number; pageSize: number }>(
      `/claims?${qs.toString()}`,
    );
  },
  getClaim: (claimId: string) =>
    request<{ claim: ClaimRow; challenge: ChallengeRow | null }>(`/claims/${claimId}`),

  getWithdrawable: (address: string) =>
    request<{ address: string; withdrawableWei: string }>(`/protocol/withdrawable/${address}`),

  authNonce: (address: string) => request<{ nonce: string }>("/auth/nonce", {
    method: "POST",
    body: JSON.stringify({ address }),
  }),
  authVerify: (message: string, signature: string) =>
    request<{ address: string; accessToken: string }>("/auth/verify", {
      method: "POST",
      body: JSON.stringify({ message, signature }),
    }),
};
