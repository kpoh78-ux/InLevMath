-- 학생이 낸 답과, 자동 채점이 판정하지 못한 문제 번호를 함께 보관한다.
-- 선생님이 나중에 단답형 채점을 고칠 때 근거가 된다.
ALTER TABLE "WorksheetResult" ADD COLUMN "studentAnswersJson" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "WorksheetResult" ADD COLUMN "pendingProblemsJson" TEXT NOT NULL DEFAULT '[]';
