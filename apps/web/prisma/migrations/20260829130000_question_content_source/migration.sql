-- 문항 마스터에 풀이·출처·원본표기·분류상태를 채운다.
--
-- 반입 앱이 문제집 PDF 에서 문제·답·풀이를 뽑아 넘겨줄 자리다.
-- 특히 raw* 컬럼은 교육과정 좌표 매칭에 실패했을 때 되짚는 유일한 단서라
-- 매칭 성공 여부와 무관하게 항상 채운다.
--
-- migrate dev 를 쓰지 않는다. 여러 번 돌려도 안전하도록 IF NOT EXISTS 로 쓴다.

ALTER TABLE "Question" ADD COLUMN IF NOT EXISTS "solution"      TEXT;
ALTER TABLE "Question" ADD COLUMN IF NOT EXISTS "answerType"    TEXT NOT NULL DEFAULT 'short';

ALTER TABLE "Question" ADD COLUMN IF NOT EXISTS "sourceBook"    TEXT;
ALTER TABLE "Question" ADD COLUMN IF NOT EXISTS "sourcePage"    INTEGER;
ALTER TABLE "Question" ADD COLUMN IF NOT EXISTS "sourceNumber"  INTEGER;

ALTER TABLE "Question" ADD COLUMN IF NOT EXISTS "rawMajorUnit"  TEXT NOT NULL DEFAULT '';
ALTER TABLE "Question" ADD COLUMN IF NOT EXISTS "rawMiddleUnit" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Question" ADD COLUMN IF NOT EXISTS "rawMinorUnit"  TEXT NOT NULL DEFAULT '';
ALTER TABLE "Question" ADD COLUMN IF NOT EXISTS "rawTypeName"   TEXT NOT NULL DEFAULT '';
ALTER TABLE "Question" ADD COLUMN IF NOT EXISTS "rawSection"    TEXT NOT NULL DEFAULT '';

ALTER TABLE "Question" ADD COLUMN IF NOT EXISTS "classifiedAt"  TIMESTAMP(3);
ALTER TABLE "Question" ADD COLUMN IF NOT EXISTS "classifiedBy"  TEXT;

CREATE INDEX IF NOT EXISTS "Question_classifiedAt_idx" ON "Question"("classifiedAt");
CREATE INDEX IF NOT EXISTS "Question_sourceBook_sourcePage_sourceNumber_idx"
  ON "Question"("sourceBook", "sourcePage", "sourceNumber");
