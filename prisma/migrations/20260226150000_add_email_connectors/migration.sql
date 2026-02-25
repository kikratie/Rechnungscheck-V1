-- CreateTable: EmailConnector
CREATE TABLE "email_connectors" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 993,
    "secure" BOOLEAN NOT NULL DEFAULT true,
    "username" TEXT NOT NULL,
    "passwordEncrypted" TEXT NOT NULL,
    "folder" TEXT NOT NULL DEFAULT 'INBOX',
    "lastSyncedUid" INTEGER,
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncStatus" TEXT,
    "lastSyncError" TEXT,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "pollIntervalMinutes" INTEGER NOT NULL DEFAULT 5,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_connectors_pkey" PRIMARY KEY ("id")
);

-- AddColumns: Invoice email metadata
ALTER TABLE "invoices" ADD COLUMN "emailSender" TEXT;
ALTER TABLE "invoices" ADD COLUMN "emailSubject" TEXT;
ALTER TABLE "invoices" ADD COLUMN "emailMessageId" TEXT;

-- CreateIndex
CREATE INDEX "email_connectors_tenantId_idx" ON "email_connectors"("tenantId");
CREATE INDEX "email_connectors_isActive_idx" ON "email_connectors"("isActive");
CREATE UNIQUE INDEX "email_connectors_tenantId_username_key" ON "email_connectors"("tenantId", "username");
CREATE INDEX "invoices_tenantId_emailMessageId_idx" ON "invoices"("tenantId", "emailMessageId");

-- AddForeignKey
ALTER TABLE "email_connectors" ADD CONSTRAINT "email_connectors_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
