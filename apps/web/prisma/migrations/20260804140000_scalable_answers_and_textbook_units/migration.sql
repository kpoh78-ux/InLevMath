-- ────────────────────────────────────────────────────────────────
-- 1) WorksheetAnswerImage → AnswerImage (학습지 + 교재 공용, 오브젝트 스토리지 대응)
-- ────────────────────────────────────────────────────────────────
ALTER TABLE "WorksheetAnswerImage" RENAME TO "AnswerImage";
ALTER TABLE "AnswerImage" RENAME CONSTRAINT "WorksheetAnswerImage_pkey" TO "AnswerImage_pkey";
ALTER TABLE "AnswerImage" RENAME CONSTRAINT "WorksheetAnswerImage_worksheetId_fkey" TO "AnswerImage_worksheetId_fkey";
ALTER INDEX "WorksheetAnswerImage_worksheetId_idx" RENAME TO "AnswerImage_worksheetId_idx";
ALTER INDEX "WorksheetAnswerImage_worksheetId_problemNo_key" RENAME TO "AnswerImage_worksheetId_problemNo_key";

ALTER TABLE "AnswerImage" ALTER COLUMN "worksheetId" DROP NOT NULL;
ALTER TABLE "AnswerImage" ALTER COLUMN "data" DROP NOT NULL;

ALTER TABLE "AnswerImage" ADD COLUMN "textbookId" TEXT;
ALTER TABLE "AnswerImage" ADD COLUMN "storage" TEXT NOT NULL DEFAULT 'db';
ALTER TABLE "AnswerImage" ADD COLUMN "objectKey" TEXT;
ALTER TABLE "AnswerImage" ADD COLUMN "bytes" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "AnswerImage_textbookId_idx" ON "AnswerImage"("textbookId");
CREATE UNIQUE INDEX "AnswerImage_textbookId_problemNo_key" ON "AnswerImage"("textbookId", "problemNo");

ALTER TABLE "AnswerImage" ADD CONSTRAINT "AnswerImage_textbookId_fkey"
  FOREIGN KEY ("textbookId") REFERENCES "Textbook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 기존 행의 용량 채우기 (base64 길이 기준 근사)
UPDATE "AnswerImage" SET "bytes" = length("data") WHERE "data" IS NOT NULL;

-- ────────────────────────────────────────────────────────────────
-- 2) TextbookProblem: 단원 계층(대/중/소) + 단계
-- ────────────────────────────────────────────────────────────────
ALTER TABLE "TextbookProblem" ADD COLUMN "majorUnit" TEXT NOT NULL DEFAULT '';
ALTER TABLE "TextbookProblem" ADD COLUMN "middleUnit" TEXT NOT NULL DEFAULT '';
ALTER TABLE "TextbookProblem" ADD COLUMN "minorUnit" TEXT NOT NULL DEFAULT '';
ALTER TABLE "TextbookProblem" ADD COLUMN "section" TEXT NOT NULL DEFAULT '';

-- 기존 자유입력 단원명은 대단원으로 이관
UPDATE "TextbookProblem" SET "majorUnit" = COALESCE("unit", '');
ALTER TABLE "TextbookProblem" DROP COLUMN "unit";

-- 3000문제 이상에서도 단원/단계 구간만 읽도록 인덱스 추가
DROP INDEX IF EXISTS "TextbookProblem_textbookId_idx";
CREATE INDEX "TextbookProblem_textbookId_number_idx" ON "TextbookProblem"("textbookId", "number");
CREATE INDEX "TextbookProblem_unit_idx"
  ON "TextbookProblem"("textbookId", "majorUnit", "middleUnit", "minorUnit", "section");