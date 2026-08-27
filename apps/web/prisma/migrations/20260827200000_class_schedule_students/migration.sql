-- 수업 ↔ 학생을 이름 문자열이 아니라 관계로 잡는다.
-- 동명이인이면 어느 학생인지 가릴 수 없어 지각 분수를 자동 계산할 수 없었다.
--
-- 기존 ClassSchedule.studentNames 는 지우지 않는다. 이름 매칭에 실패한 건을
-- 나중에 되짚어야 하므로 원본으로 남겨 둔다 (코드에서는 더 이상 읽지 않는다).
-- 실제 이관은 scripts/backfill-schedule-students.mjs 가 이름으로 학생을 찾아 채운다.

CREATE TABLE "ClassScheduleStudent" (
    "scheduleId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    CONSTRAINT "ClassScheduleStudent_pkey" PRIMARY KEY ("scheduleId","studentId")
);

CREATE INDEX "ClassScheduleStudent_studentId_idx" ON "ClassScheduleStudent"("studentId");

ALTER TABLE "ClassScheduleStudent"
    ADD CONSTRAINT "ClassScheduleStudent_scheduleId_fkey"
    FOREIGN KEY ("scheduleId") REFERENCES "ClassSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ClassScheduleStudent"
    ADD CONSTRAINT "ClassScheduleStudent_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
