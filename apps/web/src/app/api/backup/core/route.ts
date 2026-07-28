import { NextResponse, NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { getAuthUser } from '@/lib/auth';

const prisma = new PrismaClient();

export async function GET(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth || auth.role !== 'teacher') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const backupsDir = path.resolve(process.cwd(), 'apps/web/backups');
    fs.mkdirSync(backupsDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `core-data-backup-${timestamp}.json`;
    const filepath = path.join(backupsDir, filename);

    const teachers = await prisma.teacher.findMany({
      include: {
        user: true,
        students: { include: { user: true } },
        worksheets: true,
        textbooks: true,
        rewardItems: true,
        schedules: true,
      },
    });

    const worksheets = await prisma.worksheet.findMany({
      include: { teacher: { select: { id: true, userId: true } } },
    });

    const textbookProblems = await prisma.textbookProblem.findMany();
    const worksheetDistributions = await prisma.worksheetDistribution.findMany({
      include: {
        worksheet: true,
        student: { include: { user: true } },
        result: true,
      },
    });

    const worksheetResults = await prisma.worksheetResult.findMany();
    const missionResults = await prisma.missionResult.findMany();

    const data = {
      teachers,
      worksheets,
      textbookProblems,
      worksheetDistributions,
      worksheetResults,
      missionResults,
    };

    fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf8');

    const fileBuffer = fs.readFileSync(filepath);
    const res = new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });

    return res;
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
