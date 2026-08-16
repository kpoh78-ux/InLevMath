-- 교재도 학생이 직접 답을 내고 자동 채점받을 수 있게 한다.
-- 교재는 문제 번호가 1부터 이어지지 않을 수 있어 답안을 맵으로 담는다.
ALTER TABLE "TextbookResult" ADD COLUMN "studentAnswersJson" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "TextbookResult" ADD COLUMN "pendingProblemsJson" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "TextbookResult" ADD COLUMN "submittedCount" INTEGER NOT NULL DEFAULT 0;
