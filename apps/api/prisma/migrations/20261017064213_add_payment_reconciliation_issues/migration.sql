-- CreateEnum
CREATE TYPE "PaymentIssueReason" AS ENUM ('PAYMENT_NOT_FOUND', 'INVALID_PROVIDER', 'ORDER_REFERENCE_MISMATCH', 'INVALID_PAYMENT_STATUS', 'INVALID_ORDER_STATUS', 'ORDER_NOT_FOUND');

-- CreateEnum
CREATE TYPE "PaymentIssueStatus" AS ENUM ('OPEN', 'REVIEWED');

-- CreateTable
CREATE TABLE "PaymentReconciliationIssue" (
    "id" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "checkoutSessionId" TEXT NOT NULL,
    "paymentId" TEXT,
    "orderId" TEXT,
    "reason" "PaymentIssueReason" NOT NULL,
    "status" "PaymentIssueStatus" NOT NULL DEFAULT 'OPEN',
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "PaymentReconciliationIssue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentReconciliationIssue_providerEventId_key" ON "PaymentReconciliationIssue"("providerEventId");

-- CreateIndex
CREATE INDEX "PaymentReconciliationIssue_status_recordedAt_idx" ON "PaymentReconciliationIssue"("status", "recordedAt");

-- CreateIndex
CREATE INDEX "PaymentReconciliationIssue_checkoutSessionId_idx" ON "PaymentReconciliationIssue"("checkoutSessionId");

-- CreateIndex
CREATE INDEX "PaymentReconciliationIssue_orderId_idx" ON "PaymentReconciliationIssue"("orderId");
