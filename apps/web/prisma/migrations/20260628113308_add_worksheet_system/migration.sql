-- CreateEnum
CREATE TYPE "DistributionStatus" AS ENUM ('distributed', 'submitted', 'graded');

-- CreateTable
CREATE TABLE "Worksheet" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "step" TEXT NOT NULL,
    "examSubType" TEXT,
    "grade" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT '종합',
    "problemCount" INTEGER NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "teacherId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Worksheet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorksheetDistribution" (
    "id" TEXT NOT NULL,
    "worksheetId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" "DistributionStatus" NOT NULL DEFAULT 'distributed',
    "distributedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorksheetDistribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorksheetResult" (
    "id" TEXT NOT NULL,
    "distributionId" TEXT NOT NULL,
    "correctProblems" INTEGER NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorksheetResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Worksheet_teacherId_idx" ON "Worksheet"("teacherId");

-- CreateIndex
CREATE INDEX "Worksheet_category_step_idx" ON "Worksheet"("category", "step");

-- CreateIndex
CREATE INDEX "WorksheetDistribution_studentId_idx" ON "WorksheetDistribution"("studentId");

-- CreateIndex
CREATE INDEX "WorksheetDistribution_worksheetId_idx" ON "WorksheetDistribution"("worksheetId");

-- CreateIndex
CREATE UNIQUE INDEX "WorksheetDistribution_worksheetId_studentId_key" ON "WorksheetDistribution"("worksheetId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "WorksheetResult_distributionId_key" ON "WorksheetResult"("distributionId");

-- AddForeignKey
ALTER TABLE "Worksheet" ADD CONSTRAINT "Worksheet_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorksheetDistribution" ADD CONSTRAINT "WorksheetDistribution_worksheetId_fkey" FOREIGN KEY ("worksheetId") REFERENCES "Worksheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorksheetDistribution" ADD CONSTRAINT "WorksheetDistribution_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorksheetResult" ADD CONSTRAINT "WorksheetResult_distributionId_fkey" FOREIGN KEY ("distributionId") REFERENCES "WorksheetDistribution"("id") ON DELETE CASCADE ON UPDATE CASCADE;
