const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

function loadEnv(envPath) {
  if (!fs.existsSync(envPath)) {
    return;
  }

  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const equalsIndex = trimmed.indexOf('=');
    if (equalsIndex <= 0) continue;

    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1).trim();

    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    if (value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnv(path.resolve(__dirname, '../.env'));
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('ERROR: apps/web/.env에서 DATABASE_URL이 설정되어 있지 않습니다.');
  process.exit(1);
}

const backupDir = path.resolve(__dirname, '../backups');
fs.mkdirSync(backupDir, { recursive: true });

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const outputFile = path.join(backupDir, `full-db-backup-${timestamp}.dump`);

console.log(`전체 DB 백업 시작: ${outputFile}`);

const pgDumpCommand = (() => {
  const candidates = [
    'pg_dump',
    'C:\\Program Files\\PostgreSQL\\17\\bin\\pg_dump.exe',
    'C:\\Program Files (x86)\\PostgreSQL\\17\\bin\\pg_dump.exe',
    'C:\\Program Files\\PostgreSQL\\17\\pgAdmin 4\\runtime\\pg_dump.exe',
  ];

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    } catch {
      // ignore
    }
  }

  return 'pg_dump';
})();

const args = ['--format=custom', '--file', outputFile, databaseUrl];
const dump = spawn(pgDumpCommand, args, { stdio: 'inherit' });

dump.on('error', (error) => {
  console.error('pg_dump 실행에 실패했습니다. PostgreSQL 클라이언트가 설치되어 있고 PATH에 등록되어 있는지 확인하세요.');
  console.error('시도한 경로:', pgDumpCommand);
  console.error(error.message);
  process.exit(1);
});

dump.on('close', (code) => {
  if (code === 0) {
    console.log('전체 DB 백업이 완료되었습니다.');
    console.log(`백업 파일: ${outputFile}`);
    process.exit(0);
  }

  console.error(`pg_dump가 비정상 종료되었습니다. 종료 코드: ${code}`);
  process.exit(code || 1);
});
