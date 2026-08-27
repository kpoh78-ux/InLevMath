-- 하원 학습리포트가 실제로 보고할 수 있게 빠진 컬럼을 채운다.
--
-- 이 DB 는 migrate dev 를 쓸 수 없다 (이력에 없는 테이블이 db push 로 만들어져
-- 드리프트가 있어 리셋을 요구한다). SQL 을 손으로 쓰고 migrate deploy 로만 적용한다.

-- 리포트가 연산교재와 진도교재를 따로 보고한다
ALTER TABLE "Textbook" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT '진도';

-- 하원 시 자동 발송 스위치 (기본 꺼짐)
ALTER TABLE "AttendanceNotificationConfig"
  ADD COLUMN IF NOT EXISTS "autoSendOnCheckOut" BOOLEAN NOT NULL DEFAULT false;

-- 수업 태도·코멘트는 데이터로 뽑을 수 없어 선생님이 그날 직접 적는다
ALTER TABLE "DailyStudentReportOverride" ADD COLUMN IF NOT EXISTS "attitude" TEXT;
ALTER TABLE "DailyStudentReportOverride" ADD COLUMN IF NOT EXISTS "comment" TEXT;
