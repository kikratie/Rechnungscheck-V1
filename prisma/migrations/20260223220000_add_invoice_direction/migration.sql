-- Add direction column to invoices (INCOMING = Eingangsrechnung, OUTGOING = Ausgangsrechnung)
ALTER TABLE "invoices" ADD COLUMN "direction" TEXT NOT NULL DEFAULT 'INCOMING';

-- Index for filtering by direction
CREATE INDEX "invoices_tenantId_direction_idx" ON "invoices"("tenantId", "direction");
