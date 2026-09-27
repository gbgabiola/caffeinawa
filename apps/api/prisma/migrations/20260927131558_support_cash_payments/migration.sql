-- AlterEnum
ALTER TYPE "PaymentProvider" ADD VALUE 'CASH';

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "paidAt" TIMESTAMP(3),
ALTER COLUMN "provider" SET DEFAULT 'CASH',
ALTER COLUMN "checkoutSessionId" DROP NOT NULL;
