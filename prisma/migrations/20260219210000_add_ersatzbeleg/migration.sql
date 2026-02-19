-- AlterEnum: Add REPLACED to ProcessingStatus
ALTER TYPE "ProcessingStatus" ADD VALUE 'REPLACED';

-- AlterTable: Add Ersatzbeleg fields
ALTER TABLE "invoices" ADD COLUMN "replacesInvoiceId" TEXT;
ALTER TABLE "invoices" ADD COLUMN "replacedByInvoiceId" TEXT;
ALTER TABLE "invoices" ADD COLUMN "ersatzReason" TEXT;

-- CreateIndex: Unique constraints
CREATE UNIQUE INDEX "invoices_replacesInvoiceId_key" ON "invoices"("replacesInvoiceId");
CREATE UNIQUE INDEX "invoices_replacedByInvoiceId_key" ON "invoices"("replacedByInvoiceId");
