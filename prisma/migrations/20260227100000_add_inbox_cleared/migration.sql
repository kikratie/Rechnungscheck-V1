-- AlterTable
ALTER TABLE "invoices" ADD COLUMN "inboxCleared" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "invoices" ADD COLUMN "inboxClearedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "invoices_tenantId_inboxCleared_idx" ON "invoices"("tenantId", "inboxCleared");

-- Data migration: set inboxCleared=true for all invoices already past inbox stage
UPDATE "invoices"
SET "inboxCleared" = true, "inboxClearedAt" = NOW()
WHERE "processingStatus" IN ('ARCHIVED', 'RECONCILED', 'RECONCILED_WITH_DIFFERENCE', 'EXPORTED', 'REJECTED', 'REPLACED');
