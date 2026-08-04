-- 문제집 문제유형(구역) 목록을 선생님이 직접 관리할 수 있도록 저장
-- NULL이면 코드의 기본 프리셋을 사용한다
ALTER TABLE "Teacher" ADD COLUMN "sectionPresetsJson" TEXT;