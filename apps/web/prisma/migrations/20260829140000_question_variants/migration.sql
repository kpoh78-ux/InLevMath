-- 문제 확장(변형)과 선생님 수정 권한.
--
-- 문제 하나에서 숫자 바꾼 문제 · 표현 바꾼 문제 · 복합 유형으로 뻗어 나간다.
-- 복합 유형은 여러 단원 개념에 동시에 걸리므로 다대다 표가 따로 필요하다.
--
-- migrate dev 를 쓰지 않는다. 여러 번 돌려도 안전하도록 IF NOT EXISTS 로 쓴다.

-- ── 변형 관계 ────────────────────────────────────────────────────────────────
ALTER TABLE "Question" ADD COLUMN IF NOT EXISTS "variantKind" TEXT NOT NULL DEFAULT 'ORIGINAL';
ALTER TABLE "Question" ADD COLUMN IF NOT EXISTS "originId"    TEXT;

DO $$ BEGIN
  ALTER TABLE "Question"
    ADD CONSTRAINT "Question_originId_fkey"
    FOREIGN KEY ("originId") REFERENCES "Question"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "Question_originId_variantKind_idx"
  ON "Question"("originId", "variantKind");

-- ── 사람이 고친 흔적 · 오류 표시 ─────────────────────────────────────────────
ALTER TABLE "Question" ADD COLUMN IF NOT EXISTS "editedAt"   TIMESTAMP(3);
ALTER TABLE "Question" ADD COLUMN IF NOT EXISTS "editedBy"   TEXT;
ALTER TABLE "Question" ADD COLUMN IF NOT EXISTS "status"     TEXT NOT NULL DEFAULT 'active';
ALTER TABLE "Question" ADD COLUMN IF NOT EXISTS "flagReason" TEXT;

CREATE INDEX IF NOT EXISTS "Question_status_idx" ON "Question"("status");

-- ── 문항 ↔ 개념 (복합 유형용 다대다) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "QuestionConcept" (
  "questionId"    TEXT NOT NULL,
  "conceptNodeId" TEXT NOT NULL,
  "role"          TEXT NOT NULL DEFAULT 'secondary',
  CONSTRAINT "QuestionConcept_pkey" PRIMARY KEY ("questionId", "conceptNodeId")
);

CREATE INDEX IF NOT EXISTS "QuestionConcept_conceptNodeId_role_idx"
  ON "QuestionConcept"("conceptNodeId", "role");

DO $$ BEGIN
  ALTER TABLE "QuestionConcept"
    ADD CONSTRAINT "QuestionConcept_questionId_fkey"
    FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "QuestionConcept"
    ADD CONSTRAINT "QuestionConcept_conceptNodeId_fkey"
    FOREIGN KEY ("conceptNodeId") REFERENCES "ConceptNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
