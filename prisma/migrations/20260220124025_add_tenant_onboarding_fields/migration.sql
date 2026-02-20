-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "bankName" TEXT,
ADD COLUMN     "bic" TEXT,
ADD COLUMN     "country" TEXT DEFAULT 'AT',
ADD COLUMN     "email" TEXT,
ADD COLUMN     "firmenbuchNr" TEXT,
ADD COLUMN     "iban" TEXT,
ADD COLUMN     "onboardingComplete" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "phone" TEXT;
