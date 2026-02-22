-- AlterTable
ALTER TABLE "extracted_data" ADD COLUMN     "vatBreakdown" JSONB;

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "vatBreakdown" JSONB;
