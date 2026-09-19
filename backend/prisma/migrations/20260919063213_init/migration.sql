-- CreateTable
CREATE TABLE "Nonce" (
    "id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "Nonce_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IndexerCursor" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "slaOffset" INTEGER NOT NULL DEFAULT 0,
    "claimOffset" INTEGER NOT NULL DEFAULT 0,
    "lastRunAt" TIMESTAMP(3),
    "lastError" TEXT,
    "consecutiveErrors" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "IndexerCursor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlaAgreement" (
    "slaId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "customer" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "targetUptimeBps" INTEGER NOT NULL,
    "graceMinutes" INTEGER NOT NULL,
    "penaltyRateWeiPerMin" TEXT NOT NULL,
    "escrowWei" TEXT NOT NULL,
    "escrowDeposited" TEXT NOT NULL,
    "bondWei" TEXT NOT NULL,
    "bondDeposited" TEXT NOT NULL,
    "challengeBondWei" TEXT NOT NULL,
    "toleranceMinutes" INTEGER NOT NULL,
    "challengeWindowSeconds" INTEGER NOT NULL,
    "termSeconds" INTEGER NOT NULL,
    "evidenceSources" TEXT[],
    "sourceDigest" TEXT NOT NULL,
    "adjudicatedWindows" TEXT[],
    "status" TEXT NOT NULL,
    "providerFunded" BOOLEAN NOT NULL,
    "customerSigned" BOOLEAN NOT NULL,
    "createdAt" TEXT NOT NULL,
    "registrationDeadlineTs" BIGINT NOT NULL,
    "termStartTs" BIGINT NOT NULL,
    "termEndTs" BIGINT NOT NULL,
    "activeClaimId" TEXT NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SlaAgreement_pkey" PRIMARY KEY ("slaId")
);

-- CreateTable
CREATE TABLE "Claim" (
    "claimId" TEXT NOT NULL,
    "slaId" TEXT NOT NULL,
    "claimant" TEXT NOT NULL,
    "windowStartTs" BIGINT NOT NULL,
    "windowEndTs" BIGINT NOT NULL,
    "pinnedSources" TEXT[],
    "pinnedSourceDigest" TEXT NOT NULL,
    "submittedAt" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "breachMinutes" INTEGER NOT NULL,
    "inconclusiveReason" TEXT NOT NULL,
    "recommendedPayoutBps" INTEGER NOT NULL,
    "payoutWei" TEXT NOT NULL,
    "resolvedAt" TEXT NOT NULL,
    "challengeDeadlineTs" BIGINT NOT NULL,
    "challengeCount" INTEGER NOT NULL,
    "activeChallengeId" TEXT NOT NULL,
    "isChallenged" BOOLEAN NOT NULL,
    "finalized" BOOLEAN NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Claim_pkey" PRIMARY KEY ("claimId")
);

-- CreateTable
CREATE TABLE "Challenge" (
    "challengeId" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "challenger" TEXT NOT NULL,
    "additionalSources" TEXT[],
    "rationale" TEXT NOT NULL,
    "bondWei" TEXT NOT NULL,
    "bondDeposited" TEXT NOT NULL,
    "filedAt" TEXT NOT NULL,
    "resolved" BOOLEAN NOT NULL,
    "outcome" TEXT NOT NULL,
    "resolvedAt" TEXT NOT NULL,
    "priorBreachMinutes" INTEGER NOT NULL,
    "newBreachMinutes" INTEGER NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Challenge_pkey" PRIMARY KEY ("challengeId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Nonce_nonce_key" ON "Nonce"("nonce");

-- CreateIndex
CREATE INDEX "Nonce_address_idx" ON "Nonce"("address");

-- CreateIndex
CREATE UNIQUE INDEX "Session_refreshToken_key" ON "Session"("refreshToken");

-- CreateIndex
CREATE INDEX "Session_address_idx" ON "Session"("address");

-- CreateIndex
CREATE INDEX "SlaAgreement_provider_idx" ON "SlaAgreement"("provider");

-- CreateIndex
CREATE INDEX "SlaAgreement_customer_idx" ON "SlaAgreement"("customer");

-- CreateIndex
CREATE INDEX "SlaAgreement_status_idx" ON "SlaAgreement"("status");

-- CreateIndex
CREATE INDEX "Claim_slaId_idx" ON "Claim"("slaId");

-- CreateIndex
CREATE INDEX "Claim_status_idx" ON "Claim"("status");

-- CreateIndex
CREATE INDEX "Claim_claimant_idx" ON "Claim"("claimant");

-- CreateIndex
CREATE INDEX "Challenge_claimId_idx" ON "Challenge"("claimId");
