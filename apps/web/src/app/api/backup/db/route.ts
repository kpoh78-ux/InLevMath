import { NextResponse, NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { getAuthUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { findPgDump, installHint } from '@/lib/pgDump';
import { backupDir } from '@/lib/backupDir';

/** 서버의 PostgreSQL 메이저 버전 */
async function serverMajorVersion(): Promise<number | null> {
  try {
    const rows = await prisma.$queryRaw<{ v: string }[]>`SELECT version() AS v`;
    const m = /PostgreSQL (\d+)/.exec(rows[0]?.v ?? '');
    return m ? parseInt(m[1]) : null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth || auth.role !== 'teacher') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return NextResponse.json({ error: 'DATABASE_URL is not set' }, { status: 500 });
  }

  // ── pg_dump 확보 ──
  const pgDumpInfo = await findPgDump();
  const serverMajor = await serverMajorVersion();

  if (!pgDumpInfo) {
    return NextResponse.json({
      error: 'pg_dump을 찾을 수 없습니다.',
      detail: installHint(serverMajor),
    }, { status: 500 });
  }

  // pg_dump은 자기보다 높은 버전의 서버를 덤프하지 못한다
  if (serverMajor !== null && pgDumpInfo.major < serverMajor) {
    return NextResponse.json({
      error: `pg_dump 버전이 낮습니다. (설치된 pg_dump ${pgDumpInfo.major}, DB 서버 PostgreSQL ${serverMajor})`,
      detail: installHint(serverMajor),
    }, { status: 500 });
  }

  const dir = backupDir();
  fs.mkdirSync(dir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `full-db-backup-${timestamp}.dump`;
  const filepath = path.join(dir, filename);

  return await new Promise<NextResponse>((resolve) => {
    const args = ['--format=custom', '--file', filepath, databaseUrl];
    const pgDump = spawn(pgDumpInfo.path, args);

    let stderr = '';
    pgDump.stderr.on('data', (d) => (stderr += d.toString()));

    pgDump.on('error', (err) => {
      resolve(NextResponse.json({
        error: 'pg_dump 실행에 실패했습니다.',
        detail: `${err.message}\n실행 경로: ${pgDumpInfo.path}`,
      }, { status: 500 }));
    });

    pgDump.on('close', (code) => {
      if (code !== 0) {
        resolve(NextResponse.json({
          error: `pg_dump이 오류로 종료했습니다. (code ${code})`,
          detail: stderr.trim() || '(추가 정보 없음)',
        }, { status: 500 }));
        return;
      }

      try {
        const fileBuffer = fs.readFileSync(filepath);
        // 다운로드와 별개로 filepath에 원본이 남는다 (로컬 보관용)
        const res = new NextResponse(new Uint8Array(fileBuffer), {
          status: 200,
          headers: {
            'Content-Type': 'application/octet-stream',
            'Content-Disposition': `attachment; filename="${filename}"`,
            'X-Backup-Path': encodeURIComponent(filepath),
            'Access-Control-Expose-Headers': 'X-Backup-Path',
          },
        });
        resolve(res);
      } catch (e) {
        const detail = e instanceof Error ? e.message : String(e);
        resolve(NextResponse.json({ error: '백업 파일을 읽지 못했습니다.', detail }, { status: 500 }));
      }
    });
  });
}