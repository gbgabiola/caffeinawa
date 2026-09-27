-- CreateEnum
CREATE TYPE "CustomerRole" AS ENUM ('CUSTOMER', 'ADMIN');

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "role" "CustomerRole" NOT NULL DEFAULT 'CUSTOMER';
