-- AlterTable: Add invitation fields to User
ALTER TABLE "users" ADD COLUMN "invitationToken" TEXT;
ALTER TABLE "users" ADD COLUMN "invitationExpiresAt" TIMESTAMP(3);

-- Index for token lookups
CREATE INDEX "users_invitationToken_idx" ON "users"("invitationToken");
