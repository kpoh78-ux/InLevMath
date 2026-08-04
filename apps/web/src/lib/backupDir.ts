// 백업 파일을 남길 로컬 폴더 (서버 전용)
//
// 기존 코드는 process.cwd()에 무조건 'apps/web/backups'를 붙였는데,
// next dev는 apps/web에서 실행되므로 apps/web/apps/web/backups 라는 엉뚱한
// 경로가 만들어졌다. 실행 위치와 무관하게 같은 곳을 가리키도록 정리한다.
//
//   BACKUP_DIR=D:\InLevMath백업   ← .env에 지정하면 그 폴더에 저장

import fs from 'fs'
import path from 'path'

export function backupDir(): string {
  const configured = process.env.BACKUP_DIR?.trim()
  if (configured) return path.resolve(configured)

  const cwd = process.cwd()

  // 모노레포 루트에서 실행된 경우
  if (fs.existsSync(path.join(cwd, 'apps', 'web', 'package.json'))) {
    return path.join(cwd, 'apps', 'web', 'backups')
  }

  // apps/web에서 실행된 경우 (next dev 기본)
  return path.join(cwd, 'backups')
}