-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "uid" TEXT,
    "address" JSONB,
    "email" TEXT,
    "phone" TEXT,
    "iban" TEXT,
    "bic" TEXT,
    "website" TEXT,
    "notes" TEXT,
    "viesName" TEXT,
    "viesAddress" TEXT,
    "viesCheckedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- AlterTable: Add customerId to invoices
ALTER TABLE "invoices" ADD COLUMN "customerId" TEXT;

-- CreateIndex
CREATE INDEX "customers_tenantId_idx" ON "customers"("tenantId");
CREATE INDEX "customers_tenantId_name_idx" ON "customers"("tenantId", "name");
CREATE UNIQUE INDEX "customers_tenantId_uid_key" ON "customers"("tenantId", "uid");

-- CreateIndex on invoices
CREATE INDEX "invoices_customerId_idx" ON "invoices"("customerId");

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Add REJECTED to ProcessingStatus if not exists
DO $$ BEGIN
    ALTER TYPE "ProcessingStatus" ADD VALUE IF NOT EXISTS 'REJECTED';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
