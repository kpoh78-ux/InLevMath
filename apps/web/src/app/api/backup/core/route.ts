import { NextResponse, NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getAuthUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { backupDir } from '@/lib/backupDir';


export async function GET(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth || auth.role !== 'teacher') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const backupsDir = backupDir();
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

    // 서술형 정답 이미지 — storage='object'인 행은 objectKey만 들어 있으므로
    // 실제 파일은 오브젝트 스토리지 쪽 백업이 별도로 필요하다.
    const answerImages = await prisma.answerImage.findMany();

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
      answerImages,
      textbookProblems,
      worksheetDistributions,
      worksheetResults,
      missionResults,
    };

    fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf8');

    const fileBuffer = fs.readFileSync(filepath);
    const res = new NextResponse(new Uint8Array(fileBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`,
        // 다운로드와 별개로 이 경로에 원본이 남는다 (로컬 보관용)
        'X-Backup-Path': encodeURIComponent(filepath),
        'Access-Control-Expose-Headers': 'X-Backup-Path',
      },
    });

    return res;
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: '주요 데이터 백업에 실패했습니다.', detail }, { status: 500 });
  }
}
