-- AlterTable
ALTER TABLE "WorksheetDistribution" ADD COLUMN     "hiddenAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "WorksheetDistribution_hiddenAt_idx" ON "WorksheetDistribution"("hiddenAt");
