-- CreateEnum
CREATE TYPE "RecurringInterval" AS ENUM ('MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY');

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN "isRecurring" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "invoices" ADD COLUMN "recurringInterval" "RecurringInterval";
ALTER TABLE "invoices" ADD COLUMN "recurringGroupId" TEXT;
ALTER TABLE "invoices" ADD COLUMN "recurringNote" TEXT;

-- CreateIndex
CREATE INDEX "invoices_tenantId_isRecurring_idx" ON "invoices"("tenantId", "isRecurring");
