-- 학습지 생성 — 문제은행에서 문항을 골라 학습지를 만든다.
--
-- 생성 조건(specJson)과 왜 그 문항이 나왔는지(traceJson·reason)를 함께 남긴다.
-- 결과 문항만 저장하면 같은 학습지를 다시 뽑을 수도, 왜 이 문제가 나왔는지
-- 따질 수도 없다.
--
-- migrate dev 를 쓰지 않는다. 여러 번 돌려도 안전하도록 IF NOT EXISTS 로 쓴다.

CREATE TABLE IF NOT EXISTS "WorksheetGenRequest" (
  "id"          TEXT NOT NULL,
  "teacherId"   TEXT NOT NULL,
  "studentId"   TEXT,
  "kind"        TEXT NOT NULL,
  "title"       TEXT NOT NULL,
  "wanted"      INTEGER NOT NULL,
  "produced"    INTEGER NOT NULL DEFAULT 0,
  "specJson"    TEXT NOT NULL,
  "traceJson"   TEXT,
  "worksheetId" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorksheetGenRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "WorksheetGenRequest_worksheetId_key"
  ON "WorksheetGenRequest"("worksheetId");
CREATE INDEX IF NOT EXISTS "WorksheetGenRequest_teacherId_createdAt_idx"
  ON "WorksheetGenRequest"("teacherId", "createdAt");
CREATE INDEX IF NOT EXISTS "WorksheetGenRequest_studentId_kind_idx"
  ON "WorksheetGenRequest"("studentId", "kind");

CREATE TABLE IF NOT EXISTS "WorksheetGenItem" (
  "requestId"        TEXT NOT NULL,
  "questionId"       TEXT NOT NULL,
  "number"           INTEGER NOT NULL,
  "reason"           TEXT NOT NULL DEFAULT 'match',
  "sourceQuestionId" TEXT,
  CONSTRAINT "WorksheetGenItem_pkey" PRIMARY KEY ("requestId", "questionId")
);
CREATE INDEX IF NOT EXISTS "WorksheetGenItem_questionId_idx"
  ON "WorksheetGenItem"("questionId");

-- 학생 × 축(유형·개념·소단원) 정답률. 취약유형 학습지를 뽑는 근거다.
CREATE TABLE IF NOT EXISTS "StudentWeakness" (
  "id"         TEXT NOT NULL,
  "studentId"  TEXT NOT NULL,
  "axis"       TEXT NOT NULL,
  "targetId"   TEXT NOT NULL,
  "accuracy"   DOUBLE PRECISION NOT NULL,
  "attempted"  INTEGER NOT NULL,
  "wrongCount" INTEGER NOT NULL,
  "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudentWeakness_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "StudentWeakness_studentId_axis_targetId_key"
  ON "StudentWeakness"("studentId", "axis", "targetId");
CREATE INDEX IF NOT EXISTS "StudentWeakness_studentId_accuracy_idx"
  ON "StudentWeakness"("studentId", "accuracy");

DO $$ BEGIN
  ALTER TABLE "WorksheetGenRequest" ADD CONSTRAINT "WorksheetGenRequest_teacherId_fkey"
    FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "WorksheetGenRequest" ADD CONSTRAINT "WorksheetGenRequest_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "WorksheetGenRequest" ADD CONSTRAINT "WorksheetGenRequest_worksheetId_fkey"
    FOREIGN KEY ("worksheetId") REFERENCES "Worksheet"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "WorksheetGenItem" ADD CONSTRAINT "WorksheetGenItem_requestId_fkey"
    FOREIGN KEY ("requestId") REFERENCES "WorksheetGenRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "WorksheetGenItem" ADD CONSTRAINT "WorksheetGenItem_questionId_fkey"
    FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "StudentWeakness" ADD CONSTRAINT "StudentWeakness_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
