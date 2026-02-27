-- AlterEnum: Add APPROVED to ProcessingStatus
ALTER TYPE "ProcessingStatus" ADD VALUE IF NOT EXISTS 'APPROVED' BEFORE 'ARCHIVED';
