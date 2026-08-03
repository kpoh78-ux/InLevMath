-- 교재 쪽번호 — 정답 입력 화면의 기본 이동 단위 (0 = 미지정)
ALTER TABLE "TextbookProblem" ADD COLUMN "bookPage" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "TextbookProblem_page_idx" ON "TextbookProblem"("textbookId", "bookPage", "number");