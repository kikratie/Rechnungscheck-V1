-- Account lockout fields
ALTER TABLE "users" ADD COLUMN "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "lockedUntil" TIMESTAMP(3);

-- Password reset token fields
ALTER TABLE "users" ADD COLUMN "passwordResetToken" TEXT;
ALTER TABLE "users" ADD COLUMN "passwordResetExpiresAt" TIMESTAMP(3);

-- Super-admin flag (system-wide access, not tenant-bound)
ALTER TABLE "users" ADD COLUMN "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false;

-- Index for password reset token lookups
CREATE INDEX "users_passwordResetToken_idx" ON "users"("passwordResetToken");
