-- 관리자 권한 (선생님 등록·삭제, 학생 퇴원 처리 전용)
ALTER TABLE "Teacher" ADD COLUMN "isAdmin" BOOLEAN NOT NULL DEFAULT false;

-- 기존에 아무도 관리자가 아니면 아무 계정도 선생님을 관리할 수 없으므로
-- 가장 먼저 만들어진 선생님을 관리자로 승격한다
UPDATE "Teacher" SET "isAdmin" = true
WHERE "id" = (
  SELECT t."id" FROM "Teacher" t
  JOIN "User" u ON u."id" = t."userId"
  ORDER BY u."createdAt" ASC
  LIMIT 1
);
