-- 교재 완료 시점. null이면 진도 중 (등급 계산 70%), 값이 있으면 끝낸 교재 (30%)
ALTER TABLE "TextbookAssignment" ADD COLUMN "completedAt" TIMESTAMP(3);

-- 과정 전환 방식이 '교재 완료 + 학습지 90일' 기준으로 바뀌어 더 쓰지 않는다.
-- 도입 직후라 값이 들어간 적이 없다.
ALTER TABLE "Student" DROP COLUMN IF EXISTS "carryRate";
ALTER TABLE "Student" DROP COLUMN IF EXISTS "courseStartedAt";
ALTER TABLE "Student" DROP COLUMN IF EXISTS "courseKey";
