import { NextResponse, NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { getAuthUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { findPgDump } from '@/lib/pgDump';
import { backupDir } from '@/lib/backupDir';
import { streamFullExport } from '@/lib/fullExport';

// 전체 DB 백업.
//
// pg_dump 이 있으면 그걸 쓴다 (복원 충실도가 가장 높다).
// 없으면 Prisma 로 모든 테이블을 JSON 으로 내보낸다 — 운영 서버(Linux 컨테이너)에는
// pg_dump 이 없어서 예전에는 백업 자체가 불가능했다. 백업을 못 받는 것보다
// JSON 이라도 받아두는 편이 낫다.

export const maxDuration = 300;

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

/** 로컬 보관본을 남길 수 있으면 남긴다 (컨테이너에서는 실패해도 무시) */
function openLocalCopy(filename: string): { stream: fs.WriteStream; filepath: string } | null {
  try {
    const dir = backupDir();
    fs.mkdirSync(dir, { recursive: true });
    const filepath = path.join(dir, filename);
    return { stream: fs.createWriteStream(filepath), filepath };
  } catch {
    return null;
  }
}

/** pg_dump 없이 Prisma 로 전체 테이블을 JSON 으로 내보낸다 */
function jsonExportResponse(reason: string): NextResponse {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `full-db-backup-${timestamp}.json`;
  const local = openLocalCopy(filename);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of streamFullExport()) {
          local?.stream.write(chunk);
          controller.enqueue(encoder.encode(chunk));
        }
        local?.stream.end();
        controller.close();
      } catch (err) {
        local?.stream.destroy();
        controller.error(err);
      }
    },
  });

  const headers: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'X-Backup-Mode': 'json',
    'X-Backup-Reason': encodeURIComponent(reason),
    'Access-Control-Expose-Headers': 'X-Backup-Path, X-Backup-Mode, X-Backup-Reason',
  };
  if (local) headers['X-Backup-Path'] = encodeURIComponent(local.filepath);

  return new NextResponse(stream, { status: 200, headers });
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

  const pgDumpInfo = await findPgDump();
  const serverMajor = await serverMajorVersion();

  // pg_dump 이 없거나 버전이 낮으면 JSON 전체 백업으로 대신한다
  if (!pgDumpInfo) {
    return jsonExportResponse('pg_dump이 설치되어 있지 않아 JSON 전체 백업으로 받았습니다.');
  }
  if (serverMajor !== null && pgDumpInfo.major < serverMajor) {
    return jsonExportResponse(
      `pg_dump ${pgDumpInfo.major} 이 DB 서버 PostgreSQL ${serverMajor} 보다 낮아 JSON 전체 백업으로 받았습니다.`
    );
  }

  const dir = backupDir();
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    return jsonExportResponse('백업 폴더를 만들 수 없어 JSON 전체 백업으로 받았습니다.');
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `full-db-backup-${timestamp}.dump`;
  const filepath = path.join(dir, filename);

  return await new Promise<NextResponse>((resolve) => {
    const args = ['--format=custom', '--file', filepath, databaseUrl];
    const pgDump = spawn(pgDumpInfo.path, args);

    let stderr = '';
    pgDump.stderr.on('data', (d) => (stderr += d.toString()));

    pgDump.on('error', () => {
      // 찾긴 했는데 실행이 안 되는 경우 — 백업을 포기하지 않고 JSON 으로 넘어간다
      resolve(jsonExportResponse('pg_dump 실행에 실패해 JSON 전체 백업으로 받았습니다.'));
    });

    pgDump.on('close', (code) => {
      if (code !== 0) {
        resolve(jsonExportResponse(
          `pg_dump이 오류로 끝나 JSON 전체 백업으로 받았습니다. (code ${code}) ${stderr.trim()}`
        ));
        return;
      }

      try {
        const fileBuffer = fs.readFileSync(filepath);
        // 다운로드와 별개로 filepath에 원본이 남는다 (로컬 보관용)
        resolve(new NextResponse(new Uint8Array(fileBuffer), {
          status: 200,
          headers: {
            'Content-Type': 'application/octet-stream',
            'Content-Disposition': `attachment; filename="${filename}"`,
            'X-Backup-Path': encodeURIComponent(filepath),
            'X-Backup-Mode': 'pg_dump',
            'Access-Control-Expose-Headers': 'X-Backup-Path, X-Backup-Mode, X-Backup-Reason',
          },
        }));
      } catch {
        resolve(jsonExportResponse('덤프 파일을 읽지 못해 JSON 전체 백업으로 받았습니다.'));
      }
    });
  });
}
