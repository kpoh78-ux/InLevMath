-- 지각 정도(분). status가 LATE일 때만 쓴다.
-- 10·20·30·40·50 중 하나이며 60은 "60분 이상"을 뜻한다.
-- migrate dev 는 이 DB에서 스키마 리셋을 요구하므로 손으로 쓰고 deploy 로만 적용한다.
ALTER TABLE "AttendanceLog" ADD COLUMN "lateMinutes" INTEGER;
