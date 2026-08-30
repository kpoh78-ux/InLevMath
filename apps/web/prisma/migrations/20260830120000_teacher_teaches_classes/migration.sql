-- 수업을 맡는 선생님인지 표시한다.
--
-- 교육실장처럼 학원 전체를 관리만 하는 계정은 자기 시간표가 없다. 그런 계정이
-- 시간표 화면의 선생님 목록에 나오면 눌러도 빈 목록만 보여 고장으로 오해한다.
-- 이름으로 거르면 사람이 바뀔 때마다 코드를 고쳐야 하므로 계정에 표시를 둔다.
--
-- 기본값 true — 기존 선생님은 모두 수업을 맡는 것으로 본다.
-- migrate dev 를 쓰지 않는다. 여러 번 돌려도 안전하도록 IF NOT EXISTS 로 쓴다.

ALTER TABLE "Teacher"
  ADD COLUMN IF NOT EXISTS "teachesClasses" BOOLEAN NOT NULL DEFAULT true;
