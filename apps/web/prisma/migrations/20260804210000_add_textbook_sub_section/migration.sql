-- 문제유형의 하위 단계 (예: 필수유형 > 유형 1, A단계 > 심화)
-- 교재마다 구조가 달라 자유 입력 문자열로 둔다
ALTER TABLE "TextbookProblem" ADD COLUMN "subSection" TEXT NOT NULL DEFAULT '';

-- 단원/유형 인덱스에 하위 단계까지 포함
DROP INDEX IF EXISTS "TextbookProblem_unit_idx";
CREATE INDEX "TextbookProblem_unit_idx"
  ON "TextbookProblem"("textbookId", "majorUnit", "middleUnit", "minorUnit", "section", "subSection");