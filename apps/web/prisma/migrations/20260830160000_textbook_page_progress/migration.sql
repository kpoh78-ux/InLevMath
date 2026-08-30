-- 교재 채점을 페이지 단위로.
--
-- TextbookResult 는 교재 한 권을 한 행으로 들고 있어 "이 페이지를 다 봤나"를
-- 알 수 없다. 교재는 한 번에 다 풀지 않고 페이지를 나눠 나가므로, 선생님이
-- 오늘 어디까지 채점했는지 페이지 단위로 남아야 한다.
--
-- migrate dev 를 쓰지 않는다. 여러 번 돌려도 안전하도록 IF NOT EXISTS 로 쓴다.

CREATE TABLE IF NOT EXISTS "TextbookPageProgress" (
  "id"          TEXT NOT NULL,
  "textbookId"  TEXT NOT NULL,
  "studentId"   TEXT NOT NULL,
  "bookPage"    INTEGER NOT NULL,
  "status"      TEXT NOT NULL DEFAULT 'todo',
  "gradedCount" INTEGER NOT NULL DEFAULT 0,
  "wrongCount"  INTEGER NOT NULL DEFAULT 0,
  "gradedAt"    TIMESTAMP(3),
  "gradedBy"    TEXT,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TextbookPageProgress_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TextbookPageProgress_textbookId_studentId_bookPage_key"
  ON "TextbookPageProgress"("textbookId", "studentId", "bookPage");
CREATE INDEX IF NOT EXISTS "TextbookPageProgress_studentId_textbookId_bookPage_idx"
  ON "TextbookPageProgress"("studentId", "textbookId", "bookPage");
CREATE INDEX IF NOT EXISTS "TextbookPageProgress_textbookId_bookPage_status_idx"
  ON "TextbookPageProgress"("textbookId", "bookPage", "status");

DO $$ BEGIN
  ALTER TABLE "TextbookPageProgress" ADD CONSTRAINT "TextbookPageProgress_textbookId_fkey"
    FOREIGN KEY ("textbookId") REFERENCES "Textbook"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "TextbookPageProgress" ADD CONSTRAINT "TextbookPageProgress_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
