-- 교재 배정 — 학습지의 WorksheetDistribution과 같은 역할
CREATE TABLE "TextbookAssignment" (
    "id" TEXT NOT NULL,
    "textbookId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TextbookAssignment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TextbookAssignment_studentId_idx" ON "TextbookAssignment"("studentId");
CREATE INDEX "TextbookAssignment_textbookId_idx" ON "TextbookAssignment"("textbookId");
CREATE UNIQUE INDEX "TextbookAssignment_textbookId_studentId_key" ON "TextbookAssignment"("textbookId", "studentId");

ALTER TABLE "TextbookAssignment" ADD CONSTRAINT "TextbookAssignment_textbookId_fkey"
  FOREIGN KEY ("textbookId") REFERENCES "Textbook"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TextbookAssignment" ADD CONSTRAINT "TextbookAssignment_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 이미 채점 기록이 있는 학생은 그 교재를 진행 중이었던 것이므로 배정으로 이관
INSERT INTO "TextbookAssignment" ("id", "textbookId", "studentId", "assignedAt")
SELECT gen_random_uuid()::text, "textbookId", "studentId", "submittedAt"
FROM "TextbookResult"
ON CONFLICT ("textbookId", "studentId") DO NOTHING;