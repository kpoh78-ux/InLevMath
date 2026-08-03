-- CreateTable
CREATE TABLE "WorksheetAnswerImage" (
    "id" TEXT NOT NULL,
    "worksheetId" TEXT NOT NULL,
    "problemNo" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'image/webp',
    "data" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorksheetAnswerImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorksheetAnswerImage_worksheetId_idx" ON "WorksheetAnswerImage"("worksheetId");

-- CreateIndex
CREATE UNIQUE INDEX "WorksheetAnswerImage_worksheetId_problemNo_key" ON "WorksheetAnswerImage"("worksheetId", "problemNo");

-- AddForeignKey
ALTER TABLE "WorksheetAnswerImage" ADD CONSTRAINT "WorksheetAnswerImage_worksheetId_fkey" FOREIGN KEY ("worksheetId") REFERENCES "Worksheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
