-- CreateEnum
CREATE TYPE "DifferenceReason" AS ENUM ('SKONTO', 'CURRENCY_DIFFERENCE', 'TIP', 'PARTIAL_PAYMENT', 'ROUNDING', 'OTHER');

-- CreateEnum
CREATE TYPE "AccessLevel" AS ENUM ('READ', 'WRITE', 'ADMIN');

-- AlterEnum
ALTER TYPE "ProcessingStatus" ADD VALUE IF NOT EXISTS 'PARKED';
ALTER TYPE "ProcessingStatus" ADD VALUE IF NOT EXISTS 'RECONCILED_WITH_DIFFERENCE';

-- DropIndex (conditional — may already be unique constraint instead of index)
DROP INDEX IF EXISTS "invoices_tenantId_archivalNumber_idx";

-- DropIndex
DROP INDEX IF EXISTS "sequential_numbers_tenantId_prefix_year_key";

-- AlterTable
ALTER TABLE "extracted_data" ADD COLUMN     "deductibilityNote" TEXT,
ADD COLUMN     "deductibilityPercent" INTEGER DEFAULT 100,
ADD COLUMN     "hospitalityGuests" TEXT,
ADD COLUMN     "hospitalityReason" TEXT,
ADD COLUMN     "serviceType" TEXT;

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "customerName" TEXT;

-- AlterTable
ALTER TABLE "sequential_numbers" ADD COLUMN     "month" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "substitute_documents" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "paymentDate" TIMESTAMP(3),
    "amount" DECIMAL(12,2),
    "description" TEXT,
    "vatDeductible" BOOLEAN NOT NULL DEFAULT true,
    "vatNote" TEXT,
    "storagePath" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "substitute_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_differences" (
    "id" TEXT NOT NULL,
    "matchingId" TEXT NOT NULL,
    "invoiceAmount" DECIMAL(12,2) NOT NULL,
    "paidAmount" DECIMAL(12,2) NOT NULL,
    "differenceAmount" DECIMAL(12,2) NOT NULL,
    "differenceReason" "DifferenceReason" NOT NULL DEFAULT 'OTHER',
    "notes" TEXT,
    "requiresVatCorrection" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_differences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_company_access" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "accessLevel" "AccessLevel" NOT NULL DEFAULT 'READ',
    "grantedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_company_access_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "substitute_documents_tenantId_idx" ON "substitute_documents"("tenantId");

-- CreateIndex
CREATE INDEX "substitute_documents_invoiceId_idx" ON "substitute_documents"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_differences_matchingId_key" ON "payment_differences"("matchingId");

-- CreateIndex
CREATE INDEX "user_company_access_userId_idx" ON "user_company_access"("userId");

-- CreateIndex
CREATE INDEX "user_company_access_tenantId_idx" ON "user_company_access"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "user_company_access_userId_tenantId_key" ON "user_company_access"("userId", "tenantId");

-- CreateIndex (IF NOT EXISTS — may already exist from reset)
CREATE UNIQUE INDEX IF NOT EXISTS "invoices_tenantId_archivalNumber_key" ON "invoices"("tenantId", "archivalNumber");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "sequential_numbers_tenantId_prefix_year_month_key" ON "sequential_numbers"("tenantId", "prefix", "year", "month");

-- AddForeignKey
ALTER TABLE "substitute_documents" ADD CONSTRAINT "substitute_documents_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_differences" ADD CONSTRAINT "payment_differences_matchingId_fkey" FOREIGN KEY ("matchingId") REFERENCES "matchings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_company_access" ADD CONSTRAINT "user_company_access_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_company_access" ADD CONSTRAINT "user_company_access_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
