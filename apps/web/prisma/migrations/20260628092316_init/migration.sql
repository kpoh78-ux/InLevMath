-- CreateEnum
CREATE TYPE "Role" AS ENUM ('student', 'teacher');

-- CreateEnum
CREATE TYPE "MissionType" AS ENUM ('concept_learning', 'concept_problem', 'basic_problem', 'advanced_problem', 'top_problem');

-- CreateEnum
CREATE TYPE "ResultSource" AS ENUM ('manual', 'mathflat');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Teacher" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "Teacher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Student" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "school" TEXT NOT NULL DEFAULT '',
    "grade" TEXT NOT NULL DEFAULT '',
    "currentLevel" INTEGER NOT NULL DEFAULT 1,
    "currentMission" "MissionType" NOT NULL DEFAULT 'concept_learning',
    "comprehension" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reasoning" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "calculation" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "Student_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MissionResult" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "missionType" "MissionType" NOT NULL,
    "totalProblems" INTEGER NOT NULL,
    "correctProblems" INTEGER NOT NULL,
    "source" "ResultSource" NOT NULL,
    "solvedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MissionResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "Teacher_userId_key" ON "Teacher"("userId");

-- CreateIndex
CREATE INDEX "Teacher_userId_idx" ON "Teacher"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Student_userId_key" ON "Student"("userId");

-- CreateIndex
CREATE INDEX "Student_teacherId_idx" ON "Student"("teacherId");

-- CreateIndex
CREATE INDEX "MissionResult_studentId_idx" ON "MissionResult"("studentId");

-- AddForeignKey
ALTER TABLE "Teacher" ADD CONSTRAINT "Teacher_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MissionResult" ADD CONSTRAINT "MissionResult_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
