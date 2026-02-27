-- V2 Deductibility Rules: ruleType + createsReceivable + ShareholderTransaction

-- 1. Extend DeductibilityRule with ruleType and createsReceivable
ALTER TABLE "deductibility_rules"
ADD COLUMN IF NOT EXISTS "ruleType" TEXT NOT NULL DEFAULT 'standard',
ADD COLUMN IF NOT EXISTS "createsReceivable" BOOLEAN NOT NULL DEFAULT false;

-- 2. Create ShareholderTransactionType enum
DO $$ BEGIN
  CREATE TYPE "ShareholderTransactionType" AS ENUM ('RECEIVABLE', 'PAYABLE');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 3. Create ShareholderTransactionStatus enum
DO $$ BEGIN
  CREATE TYPE "ShareholderTransactionStatus" AS ENUM ('OPEN', 'PAID');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 4. Create shareholder_transactions table
CREATE TABLE IF NOT EXISTS "shareholder_transactions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "transactionType" "ShareholderTransactionType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "description" TEXT,
    "status" "ShareholderTransactionStatus" NOT NULL DEFAULT 'OPEN',
    "dueDate" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shareholder_transactions_pkey" PRIMARY KEY ("id")
);

-- 5. Add foreign keys
ALTER TABLE "shareholder_transactions"
ADD CONSTRAINT "shareholder_transactions_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "shareholder_transactions"
ADD CONSTRAINT "shareholder_transactions_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "shareholder_transactions"
ADD CONSTRAINT "shareholder_transactions_invoiceId_fkey"
FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 6. Add indexes
CREATE INDEX IF NOT EXISTS "shareholder_transactions_tenantId_idx" ON "shareholder_transactions"("tenantId");
CREATE INDEX IF NOT EXISTS "shareholder_transactions_tenantId_status_idx" ON "shareholder_transactions"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "shareholder_transactions_invoiceId_idx" ON "shareholder_transactions"("invoiceId");
