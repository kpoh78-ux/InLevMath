-- 문제은행 분류 구조 — 교육과정 좌표(개념노드)와 공식 난이도(1~5)를 문항에 붙인다.
--
-- migrate dev 를 쓰지 않는다 (이 DB 는 드리프트가 있어 리셋을 요구한다).
-- 여러 번 돌려도 안전하도록 IF NOT EXISTS / IF EXISTS 로 쓴다.

-- ── 교재 문제 ────────────────────────────────────────────────────────────────
ALTER TABLE "TextbookProblem" ADD COLUMN IF NOT EXISTS "conceptNodeId" TEXT;
ALTER TABLE "TextbookProblem" ADD COLUMN IF NOT EXISTS "difficulty" INTEGER;

DO $$ BEGIN
  ALTER TABLE "TextbookProblem"
    ADD CONSTRAINT "TextbookProblem_conceptNodeId_fkey"
    FOREIGN KEY ("conceptNodeId") REFERENCES "ConceptNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 문제은행 조회는 (좌표 + 난이도) 로 뽑는다. 예전 단일 인덱스는 이 조합을 못 탄다.
DROP INDEX IF EXISTS "TextbookProblem_subUnitId_idx";
DROP INDEX IF EXISTS "TextbookProblem_patternTypeId_idx";
CREATE INDEX IF NOT EXISTS "TextbookProblem_subUnitId_difficulty_idx"
  ON "TextbookProblem"("subUnitId", "difficulty");
CREATE INDEX IF NOT EXISTS "TextbookProblem_patternTypeId_difficulty_idx"
  ON "TextbookProblem"("patternTypeId", "difficulty");
CREATE INDEX IF NOT EXISTS "TextbookProblem_conceptNodeId_idx"
  ON "TextbookProblem"("conceptNodeId");

-- ── 문항 마스터 ──────────────────────────────────────────────────────────────
ALTER TABLE "Question" ADD COLUMN IF NOT EXISTS "conceptNodeId" TEXT;
ALTER TABLE "Question" ADD COLUMN IF NOT EXISTS "sourceType" TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE "Question" ADD COLUMN IF NOT EXISTS "sourceRef" TEXT;
ALTER TABLE "Question" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- 난이도는 "안 매김"과 "중"을 구분해야 하므로 기본값 3을 걷어내고 NULL 을 허용한다.
ALTER TABLE "Question" ALTER COLUMN "difficulty" DROP DEFAULT;
ALTER TABLE "Question" ALTER COLUMN "difficulty" DROP NOT NULL;

-- 예전 컬럼(현재 스키마에 없음) 정리 — 있으면 지운다
ALTER TABLE "Question" DROP COLUMN IF EXISTS "solution";
ALTER TABLE "Question" DROP COLUMN IF EXISTS "sourceType_old";

DO $$ BEGIN
  ALTER TABLE "Question"
    ADD CONSTRAINT "Question_conceptNodeId_fkey"
    FOREIGN KEY ("conceptNodeId") REFERENCES "ConceptNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DROP INDEX IF EXISTS "Question_subUnitId_idx";
DROP INDEX IF EXISTS "Question_patternTypeId_idx";
CREATE INDEX IF NOT EXISTS "Question_subUnitId_difficulty_idx"
  ON "Question"("subUnitId", "difficulty");
CREATE INDEX IF NOT EXISTS "Question_patternTypeId_difficulty_idx"
  ON "Question"("patternTypeId", "difficulty");
CREATE INDEX IF NOT EXISTS "Question_conceptNodeId_idx" ON "Question"("conceptNodeId");
-- 같은 원본을 두 번 올리지 못하게 한다
CREATE UNIQUE INDEX IF NOT EXISTS "Question_sourceType_sourceRef_key"
  ON "Question"("sourceType", "sourceRef");
