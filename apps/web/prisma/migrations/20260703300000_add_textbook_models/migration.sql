-- CreateTable: Textbook
CREATE TABLE "Textbook" (
    "id"        TEXT NOT NULL,
    "title"     TEXT NOT NULL,
    "grade"     TEXT NOT NULL,
    "publisher" TEXT NOT NULL DEFAULT '직접 출제',
    "teacherId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Textbook_pkey" PRIMARY KEY ("id")
);

-- CreateTable: TextbookProblem
CREATE TABLE "TextbookProblem" (
    "id"         TEXT NOT NULL,
    "textbookId" TEXT NOT NULL,
    "number"     INTEGER NOT NULL,
    "unit"       TEXT NOT NULL DEFAULT '',
    "type"       TEXT NOT NULL DEFAULT 'multiple',
    "answer"     TEXT NOT NULL DEFAULT '',
    CONSTRAINT "TextbookProblem_pkey" PRIMARY KEY ("id")
);

-- CreateTable: TextbookResult
CREATE TABLE "TextbookResult" (
    "id"                TEXT NOT NULL,
    "textbookId"        TEXT NOT NULL,
    "studentId"         TEXT NOT NULL,
    "wrongProblemsJson" TEXT NOT NULL DEFAULT '[]',
    "gradedBy"          TEXT NOT NULL DEFAULT 'teacher',
    "submittedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TextbookResult_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "Textbook_teacherId_idx" ON "Textbook"("teacherId");
CREATE INDEX "TextbookProblem_textbookId_idx" ON "TextbookProblem"("textbookId");
CREATE UNIQUE INDEX "TextbookProblem_textbookId_number_key" ON "TextbookProblem"("textbookId", "number");
CREATE INDEX "TextbookResult_studentId_idx" ON "TextbookResult"("studentId");
CREATE UNIQUE INDEX "TextbookResult_textbookId_studentId_key" ON "TextbookResult"("textbookId", "studentId");

-- Foreign Keys
ALTER TABLE "Textbook" ADD CONSTRAINT "Textbook_teacherId_fkey"
    FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TextbookProblem" ADD CONSTRAINT "TextbookProblem_textbookId_fkey"
    FOREIGN KEY ("textbookId") REFERENCES "Textbook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TextbookResult" ADD CONSTRAINT "TextbookResult_textbookId_fkey"
    FOREIGN KEY ("textbookId") REFERENCES "Textbook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TextbookResult" ADD CONSTRAINT "TextbookResult_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
