-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "avgCorrectRate" DOUBLE PRECISION,
ADD COLUMN     "carryRate" DOUBLE PRECISION,
ADD COLUMN     "courseKey" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "courseStartedAt" TIMESTAMP(3);
