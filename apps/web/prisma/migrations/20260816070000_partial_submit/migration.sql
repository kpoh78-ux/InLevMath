-- 부분 제출 — 학생이 푼 만큼만 내고 나머지는 나중에 마저 낼 수 있다.
-- 정답률 분모로 쓰기 위해 제출 문항 수를 따로 센다.
ALTER TABLE "WorksheetResult" ADD COLUMN "submittedCount" INTEGER NOT NULL DEFAULT 0;
