-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "deliveryDate" TIMESTAMP(3),
ADD COLUMN     "documentType" TEXT NOT NULL DEFAULT 'INVOICE',
ADD COLUMN     "ingestionChannel" TEXT NOT NULL DEFAULT 'UPLOAD',
ADD COLUMN     "isReverseCharge" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "issuerEmail" TEXT,
ADD COLUMN     "issuerIban" TEXT,
ADD COLUMN     "recipientUid" TEXT,
ADD COLUMN     "sequentialNumber" TEXT,
ADD COLUMN     "uploadedByUserId" TEXT;

-- CreateTable
CREATE TABLE "extracted_data" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "issuerName" TEXT,
    "issuerUid" TEXT,
    "issuerAddress" JSONB,
    "issuerEmail" TEXT,
    "issuerIban" TEXT,
    "recipientName" TEXT,
    "recipientUid" TEXT,
    "recipientAddress" JSONB,
    "invoiceNumber" TEXT,
    "sequentialNumber" TEXT,
    "invoiceDate" TIMESTAMP(3),
    "deliveryDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "description" TEXT,
    "netAmount" DECIMAL(12,2),
    "vatAmount" DECIMAL(12,2),
    "grossAmount" DECIMAL(12,2),
    "vatRate" DECIMAL(5,2),
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "isReverseCharge" BOOLEAN NOT NULL DEFAULT false,
    "accountNumber" TEXT,
    "costCenter" TEXT,
    "category" TEXT,
    "confidenceScores" JSONB DEFAULT '{}',
    "source" TEXT NOT NULL DEFAULT 'AI',
    "pipelineStage" TEXT,
    "editedByUserId" TEXT,
    "editReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "extracted_data_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "validation_results" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "overallStatus" TEXT NOT NULL,
    "amountClass" TEXT NOT NULL,
    "checks" JSONB NOT NULL DEFAULT '[]',
    "comments" TEXT,
    "extractedDataVersion" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "validation_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "extracted_data_invoiceId_idx" ON "extracted_data"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "extracted_data_invoiceId_version_key" ON "extracted_data"("invoiceId", "version");

-- CreateIndex
CREATE INDEX "validation_results_invoiceId_idx" ON "validation_results"("invoiceId");

-- CreateIndex
CREATE INDEX "validation_results_invoiceId_createdAt_idx" ON "validation_results"("invoiceId", "createdAt");

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extracted_data" ADD CONSTRAINT "extracted_data_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extracted_data" ADD CONSTRAINT "extracted_data_editedByUserId_fkey" FOREIGN KEY ("editedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "validation_results" ADD CONSTRAINT "validation_results_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
