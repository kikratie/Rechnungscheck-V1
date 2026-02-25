-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('ASSET', 'LIABILITY', 'EXPENSE', 'REVENUE', 'EQUITY');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('BANK', 'CASH');

-- CreateEnum
CREATE TYPE "BookingType" AS ENUM ('PRIVATE_WITHDRAWAL', 'PRIVATE_DEPOSIT');

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "cashConfirmedByUserId" TEXT,
ADD COLUMN     "cashPaymentDate" TIMESTAMP(3),
ADD COLUMN     "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'BANK',
ADD COLUMN     "privatePercent" INTEGER;

-- AlterTable
ALTER TABLE "vendors" ADD COLUMN     "defaultAccountNumber" TEXT;

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AccountType" NOT NULL,
    "category" TEXT,
    "taxCode" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transaction_bookings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "bookingType" "BookingType" NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "notes" TEXT,
    "confirmedByUserId" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transaction_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "accounts_tenantId_idx" ON "accounts"("tenantId");

-- CreateIndex
CREATE INDEX "accounts_tenantId_isActive_idx" ON "accounts"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_tenantId_number_key" ON "accounts"("tenantId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "transaction_bookings_transactionId_key" ON "transaction_bookings"("transactionId");

-- CreateIndex
CREATE INDEX "transaction_bookings_tenantId_idx" ON "transaction_bookings"("tenantId");

-- CreateIndex
CREATE INDEX "transaction_bookings_transactionId_idx" ON "transaction_bookings"("transactionId");

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_bookings" ADD CONSTRAINT "transaction_bookings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_bookings" ADD CONSTRAINT "transaction_bookings_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "bank_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
