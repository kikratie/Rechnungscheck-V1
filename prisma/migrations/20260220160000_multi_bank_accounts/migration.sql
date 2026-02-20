-- CreateEnum
CREATE TYPE "BankAccountType" AS ENUM ('CHECKING', 'SAVINGS', 'CREDIT_CARD', 'PAYPAL', 'OTHER');

-- CreateTable
CREATE TABLE "bank_accounts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "accountType" "BankAccountType" NOT NULL DEFAULT 'CHECKING',
    "iban" TEXT,
    "bic" TEXT,
    "bankName" TEXT,
    "cardLastFour" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bank_accounts_tenantId_idx" ON "bank_accounts"("tenantId");

-- AddForeignKey
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Data Migration: Copy existing tenant bank data into bank_accounts
INSERT INTO "bank_accounts" ("id", "tenantId", "label", "accountType", "iban", "bic", "bankName", "isPrimary", "isActive", "createdAt", "updatedAt")
SELECT
    gen_random_uuid(),
    "id",
    COALESCE("bankName", 'Geschäftskonto'),
    'CHECKING',
    "iban",
    "bic",
    "bankName",
    true,
    true,
    NOW(),
    NOW()
FROM "tenants"
WHERE "iban" IS NOT NULL OR "bic" IS NOT NULL OR "bankName" IS NOT NULL;

-- AlterTable: Remove old columns from tenants
ALTER TABLE "tenants" DROP COLUMN IF EXISTS "bankName",
DROP COLUMN IF EXISTS "bic",
DROP COLUMN IF EXISTS "iban";
