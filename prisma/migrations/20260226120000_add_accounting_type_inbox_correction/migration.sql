-- CreateEnum
CREATE TYPE "AccountingType" AS ENUM ('EA', 'ACCRUAL');

-- AlterEnum: Add INBOX and PENDING_CORRECTION to ProcessingStatus
ALTER TYPE "ProcessingStatus" ADD VALUE 'INBOX' BEFORE 'UPLOADED';
ALTER TYPE "ProcessingStatus" ADD VALUE 'PENDING_CORRECTION' AFTER 'REVIEW_REQUIRED';

-- AlterTable: Add accountingType to tenants
ALTER TABLE "tenants" ADD COLUMN "accountingType" "AccountingType" NOT NULL DEFAULT 'EA';

-- AlterTable: Add correction fields to invoices
ALTER TABLE "invoices" ADD COLUMN "correctionRequestedAt" TIMESTAMP(3);
ALTER TABLE "invoices" ADD COLUMN "correctionNote" TEXT;

-- AlterTable: Add isSystem to export_configs
ALTER TABLE "export_configs" ADD COLUMN "isSystem" BOOLEAN NOT NULL DEFAULT false;
