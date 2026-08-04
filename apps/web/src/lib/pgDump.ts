// pg_dump 실행 파일 탐색 및 버전 확인 (서버 전용)
//
// Windows에서 PostgreSQL을 설치해도 bin 폴더가 PATH에 등록되지 않는 경우가 많아
// spawn('pg_dump')이 ENOENT로 실패한다. 설치 경로를 직접 훑어서 찾아준다.
//
// 또 pg_dump는 자기 버전보다 높은 서버를 덤프하지 못한다.
// (예: pg_dump 17로 PostgreSQL 18 서버를 뜨면 "server version mismatch")
// 그래서 실행 전에 서버 메이저 버전과 비교해 미리 안내한다.

import fs from 'fs'
import path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

const WINDOWS_PG_ROOTS = [
  'C:\\Program Files\\PostgreSQL',
  'C:\\Program Files (x86)\\PostgreSQL',
]

/** 설치된 pg_dump 후보들을 메이저 버전 내림차순으로 반환 */
function candidatePaths(): string[] {
  const out: string[] = []

  const configured = process.env.PG_DUMP_PATH
  if (configured) out.push(configured)

  if (process.platform === 'win32') {
    for (const root of WINDOWS_PG_ROOTS) {
      if (!fs.existsSync(root)) continue
      const versions = fs.readdirSync(root)
        .map(name => ({ name, major: parseInt(name) }))
        .filter(v => Number.isInteger(v.major))
        .sort((a, b) => b.major - a.major)   // 최신 버전 우선
      for (const v of versions) {
        const exe = path.join(root, v.name, 'bin', 'pg_dump.exe')
        if (fs.existsSync(exe)) out.push(exe)
      }
    }
  }

  // 마지막으로 PATH에 잡힌 것
  out.push(process.platform === 'win32' ? 'pg_dump.exe' : 'pg_dump')
  return out
}

export type PgDumpInfo = { path: string; version: string; major: number }

/** 실행 가능한 pg_dump를 찾아 버전과 함께 돌려준다. 없으면 null */
export async function findPgDump(): Promise<PgDumpInfo | null> {
  for (const candidate of candidatePaths()) {
    try {
      const { stdout } = await execFileAsync(candidate, ['--version'], { timeout: 10_000 })
      // "pg_dump (PostgreSQL) 17.2" 형태
      const m = /(\d+)(?:\.(\d+))?/.exec(stdout)
      if (!m) continue
      return { path: candidate, version: stdout.trim(), major: parseInt(m[1]) }
    } catch {
      // 이 후보는 없거나 실행 불가 — 다음 후보로
    }
  }
  return null
}

/** 설치 안내 문구 */
export function installHint(serverMajor: number | null) {
  const want = serverMajor ?? 18
  return process.platform === 'win32'
    ? `PostgreSQL ${want} 클라이언트 도구를 설치한 뒤 다시 시도하세요. ` +
      `https://www.postgresql.org/download/windows/ 에서 설치할 때 "Command Line Tools"만 선택해도 됩니다. ` +
      `설치 경로가 특이하면 apps/web/.env에 PG_DUMP_PATH="C:\\Program Files\\PostgreSQL\\${want}\\bin\\pg_dump.exe" 를 지정하세요.`
    : `PostgreSQL ${want} 클라이언트 도구(postgresql-client-${want})를 설치한 뒤 다시 시도하세요.`
}