-- CreateTable
CREATE TABLE "RewardRule" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "source" TEXT NOT NULL DEFAULT 'any',
    "minRate" INTEGER NOT NULL DEFAULT 80,
    "points" INTEGER NOT NULL DEFAULT 0,
    "itemId" TEXT,
    "label" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RewardRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutoRewardLog" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "itemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutoRewardLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RewardRule_teacherId_idx" ON "RewardRule"("teacherId");

-- CreateIndex
CREATE INDEX "RewardRule_itemId_idx" ON "RewardRule"("itemId");

-- CreateIndex
CREATE INDEX "AutoRewardLog_studentId_idx" ON "AutoRewardLog"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "AutoRewardLog_sourceType_sourceId_studentId_key" ON "AutoRewardLog"("sourceType", "sourceId", "studentId");

-- AddForeignKey
ALTER TABLE "RewardRule" ADD CONSTRAINT "RewardRule_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardRule" ADD CONSTRAINT "RewardRule_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "RewardItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoRewardLog" ADD CONSTRAINT "AutoRewardLog_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
