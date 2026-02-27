-- CreateTable
CREATE TABLE "deductibility_rules" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "inputTaxPercent" DECIMAL(5,2) NOT NULL,
    "expensePercent" DECIMAL(5,2) NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deductibility_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "deductibility_rules_tenantId_name_key" ON "deductibility_rules"("tenantId", "name");

-- CreateIndex
CREATE INDEX "deductibility_rules_tenantId_isActive_idx" ON "deductibility_rules"("tenantId", "isActive");

-- AddForeignKey
ALTER TABLE "deductibility_rules" ADD CONSTRAINT "deductibility_rules_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable: Add approval rule fields to invoices
ALTER TABLE "invoices" ADD COLUMN "approvalRuleId" TEXT;
ALTER TABLE "invoices" ADD COLUMN "approvalNote" TEXT;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_approvalRuleId_fkey" FOREIGN KEY ("approvalRuleId") REFERENCES "deductibility_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;
