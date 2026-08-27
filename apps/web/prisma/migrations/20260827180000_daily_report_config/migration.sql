-- 하원 연동 학습리포트 발송 설정 두 모델.
--
-- 이 DB는 마이그레이션 이력에 없는 테이블이 db push 로 만들어져 있어
-- prisma migrate dev 가 스키마 리셋을 요구한다. 손으로 쓰고 migrate deploy 로만 적용한다.
-- 새 테이블 두 개를 만들 뿐이라 기존 데이터는 건드리지 않는다.

-- 학원 기본 프리셋 (학원 대표 계정 하나)
CREATE TABLE "AttendanceNotificationConfig" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "includeAttendance" BOOLEAN NOT NULL DEFAULT true,
    "includeHomework" BOOLEAN NOT NULL DEFAULT true,
    "includeCalcBook" BOOLEAN NOT NULL DEFAULT true,
    "includeProgressBook" BOOLEAN NOT NULL DEFAULT true,
    "includeWorksheet" BOOLEAN NOT NULL DEFAULT true,
    "includeUnitExam" BOOLEAN NOT NULL DEFAULT true,
    "includeGoalRate" BOOLEAN NOT NULL DEFAULT false,
    "includeAttitude" BOOLEAN NOT NULL DEFAULT false,
    "includeComment" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AttendanceNotificationConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AttendanceNotificationConfig_teacherId_key"
    ON "AttendanceNotificationConfig"("teacherId");

ALTER TABLE "AttendanceNotificationConfig"
    ADD CONSTRAINT "AttendanceNotificationConfig_teacherId_fkey"
    FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 당일 오버라이드 (학생 × 날짜)
CREATE TABLE "DailyStudentReportOverride" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "includeAttendance" BOOLEAN NOT NULL DEFAULT true,
    "includeHomework" BOOLEAN NOT NULL DEFAULT true,
    "includeCalcBook" BOOLEAN NOT NULL DEFAULT true,
    "includeProgressBook" BOOLEAN NOT NULL DEFAULT true,
    "includeWorksheet" BOOLEAN NOT NULL DEFAULT true,
    "includeUnitExam" BOOLEAN NOT NULL DEFAULT true,
    "includeGoalRate" BOOLEAN NOT NULL DEFAULT false,
    "includeAttitude" BOOLEAN NOT NULL DEFAULT false,
    "includeComment" BOOLEAN NOT NULL DEFAULT false,
    "editedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DailyStudentReportOverride_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DailyStudentReportOverride_studentId_date_key"
    ON "DailyStudentReportOverride"("studentId", "date");

CREATE INDEX "DailyStudentReportOverride_date_idx"
    ON "DailyStudentReportOverride"("date");

ALTER TABLE "DailyStudentReportOverride"
    ADD CONSTRAINT "DailyStudentReportOverride_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
