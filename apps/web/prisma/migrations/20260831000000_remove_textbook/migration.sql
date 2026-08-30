-- 교재(Textbook) 기능 전체 삭제.
--
-- 채점·문제은행·유사문제/오답 학습지 생성은 LevMathPro(별도 앱·별도 DB)로 옮긴다.
-- InLevMath는 학원 수업관리·시험대비·상담 및 학생관리·알림톡을 주기능으로 한다.
--
-- 실데이터는 교재 1권·문항 25개뿐이라 (2026-08-30 확인) 잃는 것이 없다.
-- 여러 번 실행해도 안전하도록 IF EXISTS 를 쓴다.

-- ── 하원 리포트의 연산교재/진도교재 항목도 함께 지운다 ────────────────────────
-- Textbook.kind 로 가르던 두 항목이라 Textbook 삭제와 함께 없앤다.
ALTER TABLE "AttendanceNotificationConfig" DROP COLUMN IF EXISTS "includeCalcBook";
ALTER TABLE "AttendanceNotificationConfig" DROP COLUMN IF EXISTS "includeProgressBook";
ALTER TABLE "DailyStudentReportOverride" DROP COLUMN IF EXISTS "includeCalcBook";
ALTER TABLE "DailyStudentReportOverride" DROP COLUMN IF EXISTS "includeProgressBook";

-- ── 교재 전용이던 선생님 설정 ──────────────────────────────────────────────
ALTER TABLE "Teacher" DROP COLUMN IF EXISTS "sectionPresetsJson";

-- ── AnswerImage 의 교재 쪽 절반만 걷어낸다 (worksheetId 쪽은 그대로 둔다) ────
-- Textbook 을 참조하는 FK 라 테이블을 지우기 전에 먼저 끊어야 한다.
-- 복합 유니크 제약이 이 컬럼에 걸려 있어 CASCADE 로 함께 지운다.
ALTER TABLE "AnswerImage" DROP COLUMN IF EXISTS "textbookId" CASCADE;

-- ── 자식 → 부모 순서로 삭제 (FK 안전) ───────────────────────────────────────
DROP TABLE IF EXISTS "TextbookResult";
DROP TABLE IF EXISTS "TextbookPageProgress";
DROP TABLE IF EXISTS "TextbookAssignment";
DROP TABLE IF EXISTS "TextbookProblem";
DROP TABLE IF EXISTS "Textbook";
