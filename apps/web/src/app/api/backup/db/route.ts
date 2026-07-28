import { NextResponse, NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { getAuthUser } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth || auth.role !== 'teacher') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return NextResponse.json({ error: 'DATABASE_URL is not set' }, { status: 500 });
  }

  const backupsDir = path.resolve(process.cwd(), 'apps/web/backups');
  fs.mkdirSync(backupsDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `full-db-backup-${timestamp}.dump`;
  const filepath = path.join(backupsDir, filename);

  return await new Promise<NextResponse>((resolve) => {
    const args = ['--format=custom', '--file', filepath, databaseUrl];
    const pgDump = spawn(process.env.PG_DUMP_PATH || 'pg_dump', args);

    let stderr = '';
    pgDump.stderr.on('data', (d) => (stderr += d.toString()));

    pgDump.on('error', (err) => {
      resolve(NextResponse.json({ error: 'pg_dump execution failed', detail: err.message }, { status: 500 }));
    });

    pgDump.on('close', (code) => {
      if (code !== 0) {
        resolve(NextResponse.json({ error: 'pg_dump exited with code ' + code, detail: stderr }, { status: 500 }));
        return;
      }

      try {
        const fileBuffer = fs.readFileSync(filepath);
        // send as attachment
        const res = new NextResponse(fileBuffer, {
          status: 200,
          headers: {
            'Content-Type': 'application/octet-stream',
            'Content-Disposition': `attachment; filename="${filename}"`,
          },
        });
        // optional: keep the file for audit; do not delete automatically
        resolve(res);
      } catch (e) {
        const detail = e instanceof Error ? e.message : String(e);
        resolve(NextResponse.json({ error: 'failed to read backup file', detail }, { status: 500 }));
      }
    });
  });
}
