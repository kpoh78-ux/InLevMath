-- AlterTable
ALTER TABLE "WorksheetResult"
  ADD COLUMN "wrongProblemsJson" TEXT NOT NULL DEFAULT '[]',
  ADD COLUMN "gradedBy" TEXT NOT NULL DEFAULT 'student';
