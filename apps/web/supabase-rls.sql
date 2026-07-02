-- ============================================================
-- InLevMath — Supabase RLS (Row Level Security) 정책
-- 실행 방법: Supabase 대시보드 → SQL Editor → 이 파일 전체 붙여넣기 후 실행
-- ============================================================
-- 주의: Prisma는 service_role(superuser)로 접속하므로 RLS 우회됨
-- 아래 정책은 Supabase 대시보드, psql, anon 키 직접 접근에 적용됨

-- ── RLS 활성화 ──────────────────────────────────────────────
ALTER TABLE "User"                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Teacher"                ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Student"                ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ClassSchedule"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Worksheet"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WorksheetDistribution"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WorksheetResult"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MissionResult"          ENABLE ROW LEVEL SECURITY;

-- ── 헬퍼 함수: Supabase auth.uid() → Prisma User.id 변환 ─────
CREATE OR REPLACE FUNCTION current_prisma_user_id()
RETURNS TEXT LANGUAGE SQL STABLE SECURITY DEFINER AS $$
  SELECT id FROM "User" WHERE "supabaseId" = auth.uid()::text
$$;

CREATE OR REPLACE FUNCTION current_teacher_id()
RETURNS TEXT LANGUAGE SQL STABLE SECURITY DEFINER AS $$
  SELECT id FROM "Teacher" WHERE "userId" = current_prisma_user_id()
$$;

-- ── User 테이블: 본인 행만 접근 ───────────────────────────────
DROP POLICY IF EXISTS "users_own_row" ON "User";
CREATE POLICY "users_own_row" ON "User"
  FOR ALL USING ("supabaseId" = auth.uid()::text);

-- ── Teacher 테이블: 본인 Teacher 행만 접근 ───────────────────
DROP POLICY IF EXISTS "teachers_own_row" ON "Teacher";
CREATE POLICY "teachers_own_row" ON "Teacher"
  FOR ALL USING ("userId" = current_prisma_user_id());

-- ── Student 테이블: 담당 선생님만 접근 ──────────────────────
DROP POLICY IF EXISTS "students_by_teacher" ON "Student";
CREATE POLICY "students_by_teacher" ON "Student"
  FOR ALL USING ("teacherId" = current_teacher_id());

-- ── ClassSchedule: 담당 선생님만 접근 ───────────────────────
DROP POLICY IF EXISTS "schedule_by_teacher" ON "ClassSchedule";
CREATE POLICY "schedule_by_teacher" ON "ClassSchedule"
  FOR ALL USING ("teacherId" = current_teacher_id());

-- ── Worksheet: 담당 선생님만 접근 ────────────────────────────
DROP POLICY IF EXISTS "worksheets_by_teacher" ON "Worksheet";
CREATE POLICY "worksheets_by_teacher" ON "Worksheet"
  FOR ALL USING ("teacherId" = current_teacher_id());

-- ── WorksheetDistribution: 배포한 선생님 또는 대상 학생 접근 ─
DROP POLICY IF EXISTS "distribution_access" ON "WorksheetDistribution";
CREATE POLICY "distribution_access" ON "WorksheetDistribution"
  FOR ALL USING (
    -- 선생님: 자신이 배포한 학습지
    "worksheetId" IN (SELECT id FROM "Worksheet" WHERE "teacherId" = current_teacher_id())
    OR
    -- 학생: 자신에게 배포된 학습지
    "studentId" IN (SELECT id FROM "Student" WHERE "userId" = current_prisma_user_id())
  );

-- ── WorksheetResult: WorksheetDistribution과 동일 기준 ───────
DROP POLICY IF EXISTS "result_access" ON "WorksheetResult";
CREATE POLICY "result_access" ON "WorksheetResult"
  FOR ALL USING (
    "distributionId" IN (
      SELECT wd.id FROM "WorksheetDistribution" wd
      JOIN "Worksheet" w ON wd."worksheetId" = w.id
      WHERE w."teacherId" = current_teacher_id()
         OR wd."studentId" IN (SELECT id FROM "Student" WHERE "userId" = current_prisma_user_id())
    )
  );

-- ── MissionResult: 본인 학생 결과만 접근 ─────────────────────
DROP POLICY IF EXISTS "mission_result_access" ON "MissionResult";
CREATE POLICY "mission_result_access" ON "MissionResult"
  FOR ALL USING (
    -- 학생: 본인 기록
    "studentId" IN (SELECT id FROM "Student" WHERE "userId" = current_prisma_user_id())
    OR
    -- 선생님: 담당 학생 기록
    "studentId" IN (SELECT id FROM "Student" WHERE "teacherId" = current_teacher_id())
  );
