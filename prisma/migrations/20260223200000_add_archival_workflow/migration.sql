-- Add archival workflow: sequential numbers, archival fields, enum changes

-- Step 1: Add new enum values FIRST (before removing APPROVED)
ALTER TYPE "ProcessingStatus" ADD VALUE IF NOT EXISTS 'ARCHIVED';
ALTER TYPE "ProcessingStatus" ADD VALUE IF NOT EXISTS 'RECONCILED';

-- Step 2: Migrate existing APPROVED records to PROCESSED
UPDATE "invoices" SET "processingStatus" = 'PROCESSED' WHERE "processingStatus" = 'APPROVED';

-- Step 3: Remove APPROVED from enum
-- PostgreSQL doesn't support DROP VALUE, so recreate the enum
ALTER TYPE "ProcessingStatus" RENAME TO "ProcessingStatus_old";

CREATE TYPE "ProcessingStatus" AS ENUM (
  'UPLOADED',
  'PROCESSING',
  'PROCESSED',
  'REVIEW_REQUIRED',
  'ARCHIVED',
  'RECONCILED',
  'EXPORTED',
  'ERROR',
  'REPLACED'
);

-- Must convert ALL columns that use the old enum type
ALTER TABLE "invoices"
  ALTER COLUMN "processingStatus" DROP DEFAULT;
ALTER TABLE "invoices"
  ALTER COLUMN "processingStatus" TYPE "ProcessingStatus"
  USING "processingStatus"::text::"ProcessingStatus";
ALTER TABLE "invoices"
  ALTER COLUMN "processingStatus" SET DEFAULT 'UPLOADED'::"ProcessingStatus";

ALTER TABLE "bank_statements"
  ALTER COLUMN "processingStatus" DROP DEFAULT;
ALTER TABLE "bank_statements"
  ALTER COLUMN "processingStatus" TYPE "ProcessingStatus"
  USING "processingStatus"::text::"ProcessingStatus";
ALTER TABLE "bank_statements"
  ALTER COLUMN "processingStatus" SET DEFAULT 'UPLOADED'::"ProcessingStatus";

DROP TYPE "ProcessingStatus_old";

-- Step 4: Add archival fields to Invoice
ALTER TABLE "invoices" ADD COLUMN "archivalNumber" TEXT;
ALTER TABLE "invoices" ADD COLUMN "archivalPrefix" TEXT;
ALTER TABLE "invoices" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "invoices" ADD COLUMN "archivedByUserId" TEXT;
ALTER TABLE "invoices" ADD COLUMN "archivedStoragePath" TEXT;
ALTER TABLE "invoices" ADD COLUMN "archivedFileName" TEXT;
ALTER TABLE "invoices" ADD COLUMN "stampFailed" BOOLEAN NOT NULL DEFAULT false;

-- Step 5: Add indexes and unique constraint for archival number
CREATE UNIQUE INDEX "invoices_tenantId_archivalNumber_key" ON "invoices"("tenantId", "archivalNumber") WHERE "archivalNumber" IS NOT NULL;
CREATE INDEX "invoices_tenantId_archivalNumber_idx" ON "invoices"("tenantId", "archivalNumber");

-- Step 6: Create sequential_numbers table
CREATE TABLE "sequential_numbers" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sequential_numbers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sequential_numbers_tenantId_prefix_year_key" ON "sequential_numbers"("tenantId", "prefix", "year");
CREATE INDEX "sequential_numbers_tenantId_idx" ON "sequential_numbers"("tenantId");

ALTER TABLE "sequential_numbers" ADD CONSTRAINT "sequential_numbers_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Step 7: Create cancelled_numbers table
CREATE TABLE "cancelled_numbers" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "archivalNumber" TEXT NOT NULL,
    "invoiceId" TEXT,
    "reason" TEXT NOT NULL,
    "cancelledByUserId" TEXT NOT NULL,
    "cancelledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cancelled_numbers_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "cancelled_numbers_tenantId_idx" ON "cancelled_numbers"("tenantId");

ALTER TABLE "cancelled_numbers" ADD CONSTRAINT "cancelled_numbers_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
