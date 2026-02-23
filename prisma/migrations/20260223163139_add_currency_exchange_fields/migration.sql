-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "estimatedEurGross" DECIMAL(12,2),
ADD COLUMN     "exchangeRate" DECIMAL(12,6),
ADD COLUMN     "exchangeRateDate" TIMESTAMP(3);
