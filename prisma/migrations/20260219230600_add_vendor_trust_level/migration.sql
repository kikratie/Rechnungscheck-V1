-- CreateEnum
CREATE TYPE "VendorTrustLevel" AS ENUM ('NEW', 'VERIFIED', 'TRUSTED');

-- AlterTable
ALTER TABLE "vendors" ADD COLUMN     "trustLevel" "VendorTrustLevel" NOT NULL DEFAULT 'NEW';
