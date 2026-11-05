CREATE TABLE "PayMongoCheckoutAttempt" (
  "paymentId" TEXT NOT NULL,
  "requestBody" TEXT NOT NULL,
  "scopeHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PayMongoCheckoutAttempt_pkey" PRIMARY KEY ("paymentId"),
  CONSTRAINT "PayMongoCheckoutAttempt_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
