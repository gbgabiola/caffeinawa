ALTER TABLE "Cart" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0;
CREATE TYPE "CheckoutRequestStatus" AS ENUM ('PENDING', 'COMPLETED', 'CANCELLED');
CREATE TABLE "CheckoutRequest" (
  "customerId" TEXT NOT NULL,
  "idempotencyKey" UUID NOT NULL,
  "paymentProvider" "PaymentProvider" NOT NULL,
  "cartRevision" INTEGER NOT NULL,
  "status" "CheckoutRequestStatus" NOT NULL DEFAULT 'PENDING',
  "orderId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CheckoutRequest_pkey" PRIMARY KEY ("customerId", "idempotencyKey"),
  CONSTRAINT "CheckoutRequest_revision_check" CHECK ("cartRevision" >= 0),
  CONSTRAINT "CheckoutRequest_outcome_check" CHECK (
    ("status" = 'COMPLETED' AND "orderId" IS NOT NULL) OR
    ("status" IN ('PENDING', 'CANCELLED') AND "orderId" IS NULL)
  ),
  CONSTRAINT "CheckoutRequest_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CheckoutRequest_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CheckoutRequest_orderId_key" ON "CheckoutRequest"("orderId");
