-- AlterTable: Add belegNr column
ALTER TABLE "invoices" ADD COLUMN "belegNr" INTEGER NOT NULL DEFAULT 0;

-- Backfill: Set sequential belegNr per tenant based on createdAt
WITH numbered AS (
  SELECT id, "tenantId", ROW_NUMBER() OVER (PARTITION BY "tenantId" ORDER BY "createdAt" ASC) AS rn
  FROM "invoices"
)
UPDATE "invoices" SET "belegNr" = numbered.rn
FROM numbered WHERE "invoices".id = numbered.id;

-- CreateIndex: Unique constraint on (tenantId, belegNr)
CREATE UNIQUE INDEX "invoices_tenantId_belegNr_key" ON "invoices"("tenantId", "belegNr");
