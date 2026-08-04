-- 학생 상세 정보 팝업에서 수정하는 선택 입력 항목
ALTER TABLE "Student" ADD COLUMN "address"   TEXT NOT NULL DEFAULT '';
ALTER TABLE "Student" ADD COLUMN "homePhone" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Student" ADD COLUMN "birthDate" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Student" ADD COLUMN "email"     TEXT NOT NULL DEFAULT '';
ALTER TABLE "Student" ADD COLUMN "memo"      TEXT NOT NULL DEFAULT '';
