#!/usr/bin/env node
//
// 전체 백업(JSON) 복원 — 학원관리 → 백업·용량에서 받은 full-db-backup-*.json 을 되돌린다.
//
// 웹 화면에 버튼으로 두지 않았다. 복원은 되돌릴 수 없고, 잘못 누르면 운영 데이터를
// 덮어쓴다. 사람이 터미널에서 대상 DB를 눈으로 확인하고 실행해야 한다.
//
//   확인만 (아무것도 바꾸지 않음)
//     node scripts/restore-backup.mjs 백업.json
//
//   빠진 것만 채우기 — 이미 있는 행은 건드리지 않는다
//     node scripts/restore-backup.mjs 백업.json --merge
//
//   통째로 되돌리기 — 기존 데이터를 지우고 백업 시점으로 되돌린다
//     node scripts/restore-backup.mjs 백업.json --replace --yes-delete-everything
//
// 참고: 이 스크립트는 apps/web 에서 실행해야 한다 (@prisma/client 와 .env 를 쓴다).

import { readFileSync, existsSync } from 'node:fs'
import { createInterface } from 'node:readline/promises'
import { Prisma, PrismaClient } from '@prisma/client'

// ── .env 로드 (plain node 라 Next 가 안 읽어준다) ─────────────────────────────
if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/.exec(line.trim())
    if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, '')
  }
}

// ── 인자 ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const file = args.find(a => !a.startsWith('--'))
const merge = args.includes('--merge')
const replace = args.includes('--replace')
const confirmed = args.includes('--yes-delete-everything')

if (!file) {
  console.error('사용법: node scripts/restore-backup.mjs <백업.json> [--merge | --replace --yes-delete-everything]')
  process.exit(1)
}
if (!existsSync(file)) {
  console.error(`파일을 찾을 수 없습니다: ${file}`)
  process.exit(1)
}
if (merge && replace) {
  console.error('--merge 와 --replace 는 함께 쓸 수 없습니다.')
  process.exit(1)
}

const mode = replace ? 'replace' : merge ? 'merge' : 'dry-run'

// ── 백업 읽기 ───────────────────────────────────────────────────────────────
const backup = JSON.parse(readFileSync(file, 'utf8'))
if (backup.format !== 'inlevmath-full-export') {
  console.error('이 파일은 전체 백업(inlevmath-full-export)이 아닙니다.')
  console.error('학원관리 → 백업·용량 → "전체 DB 백업 다운로드"로 받은 파일이어야 합니다.')
  process.exit(1)
}

// ── DMMF 로 필드 타입을 알아낸다 (DateTime 문자열 → Date 변환용) ────────────
const modelByLower = new Map(
  Prisma.dmmf.datamodel.models.map(m => [m.name[0].toLowerCase() + m.name.slice(1), m])
)

/** 백업의 한 행을 Prisma 가 받는 형태로 바꾼다 (관계 필드 제거, 날짜 복원) */
function toRow(modelName, raw) {
  const model = modelByLower.get(modelName)
  if (!model) return null
  const out = {}
  for (const f of model.fields) {
    if (f.kind === 'object') continue          // 관계는 외래키 컬럼으로 충분하다
    if (!(f.name in raw)) continue
    const v = raw[f.name]
    if (v === null || v === undefined) { out[f.name] = null; continue }
    if (f.type === 'DateTime') out[f.name] = new Date(v)
    else if (f.type === 'BigInt') out[f.name] = BigInt(v)
    else out[f.name] = v
  }
  return out
}

// ── 실행 ────────────────────────────────────────────────────────────────────
const prisma = new PrismaClient()

const dbHost = (() => {
  try { return new URL(process.env.DATABASE_URL).host } catch { return '(알 수 없음)' }
})()

const tableNames = Object.keys(backup.tables)
const backupRows = tableNames.reduce((s, t) => s + backup.tables[t].length, 0)

console.log('')
console.log('  백업 파일   ', file)
console.log('  만든 시각   ', backup.exportedAt)
console.log('  담긴 내용   ', `${tableNames.length}개 테이블 / ${backupRows.toLocaleString()}행`)
console.log('  복원 대상 DB', dbHost)
console.log('  방식        ', mode === 'dry-run' ? '확인만 (아무것도 바꾸지 않음)'
                            : mode === 'merge' ? '빠진 것만 채우기'
                            : '통째로 되돌리기 (기존 데이터 삭제)')
console.log('')

// 현재 DB 상태와 비교
console.log('  테이블'.padEnd(28), '백업'.padStart(8), '현재DB'.padStart(8), '차이'.padStart(8))
console.log('  ' + '-'.repeat(54))
const current = {}
for (const t of tableNames) {
  if (!prisma[t]) { console.log(`  ${t.padEnd(26)} ★ 이 스키마에 없는 테이블 — 건너뜁니다`); continue }
  const n = await prisma[t].count()
  current[t] = n
  const b = backup.tables[t].length
  if (b === 0 && n === 0) continue
  const diff = b - n
  console.log(
    '  ' + t.padEnd(26) + String(b).padStart(8) + String(n).padStart(8) +
    (diff === 0 ? '        -' : String(diff > 0 ? `+${diff}` : diff).padStart(9))
  )
}
console.log('')

if (mode === 'dry-run') {
  console.log('  확인만 했습니다. 아무것도 바꾸지 않았습니다.')
  console.log('  실제로 복원하려면 --merge 또는 --replace 를 붙이세요.')
  await prisma.$disconnect()
  process.exit(0)
}

if (mode === 'replace') {
  const willDelete = Object.values(current).reduce((a, b) => a + b, 0)
  console.log(`  ⚠ ${dbHost} 의 데이터 ${willDelete.toLocaleString()}행을 모두 지우고 백업으로 되돌립니다.`)
  if (!confirmed) {
    console.log('  --yes-delete-everything 를 함께 붙여야 실행됩니다.')
    await prisma.$disconnect()
    process.exit(1)
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const typed = await rl.question(`  되돌리려면 DB 주소를 그대로 입력하세요 (${dbHost}): `)
  rl.close()
  if (typed.trim() !== dbHost) {
    console.log('  입력이 달라 중단했습니다.')
    await prisma.$disconnect()
    process.exit(1)
  }
  // 자식 → 부모 순으로 지운다 (외래키)
  for (const t of [...tableNames].reverse()) {
    if (!prisma[t]) continue
    await prisma[t].deleteMany({})
  }
  console.log('  기존 데이터를 지웠습니다.')
}

// 부모 → 자식 순으로 넣는다 (백업의 테이블 순서가 이미 그렇다)
//
// 한 행씩 create 하면 원격 DB 왕복이 행 수만큼 생겨 6천 행에도 몇 분씩 걸린다.
// createMany + skipDuplicates 로 묶어 보내고, 통째로 실패한 묶음만 한 행씩 다시 시도해
// 어느 행이 왜 실패했는지 남긴다.
const CHUNK = 500
let inserted = 0, skipped = 0, failed = 0

for (const t of tableNames) {
  if (!prisma[t]) continue
  const rows = backup.tables[t]
  if (rows.length === 0) continue

  const before = await prisma[t].count()
  let fail = 0

  for (let i = 0; i < rows.length; i += CHUNK) {
    const batch = rows.slice(i, i + CHUNK).map(r => toRow(t, r)).filter(Boolean)
    if (batch.length === 0) continue
    try {
      await prisma[t].createMany({ data: batch, skipDuplicates: true })
    } catch {
      // 묶음이 통째로 실패하면 한 행씩 넣어 원인을 찾는다
      for (const data of batch) {
        try { await prisma[t].create({ data }) }
        catch (e) {
          if (e?.code === 'P2002') continue          // 이미 있는 행 — 정상
          fail++
          if (fail <= 3) console.log(`    ${t}: ${e?.code ?? ''} ${String(e?.message ?? e).split('\n')[0]}`)
        }
      }
    }
  }

  const after = await prisma[t].count()
  const ok = after - before
  const skip = rows.length - ok - fail
  inserted += ok; skipped += Math.max(0, skip); failed += fail
  console.log(`  ${t.padEnd(26)} 넣음 ${String(ok).padStart(5)}  건너뜀 ${String(Math.max(0, skip)).padStart(5)}  실패 ${String(fail).padStart(4)}`)
}

console.log('')
console.log(`  완료 — 넣음 ${inserted.toLocaleString()} / 건너뜀 ${skipped.toLocaleString()} / 실패 ${failed.toLocaleString()}`)
if (failed > 0) {
  console.log('  실패한 행이 있습니다. 위 메시지를 확인하세요.')
  console.log('  (부모 행이 없어서일 수 있습니다 — 백업이 일부만 담고 있는 경우)')
}
await prisma.$disconnect()
process.exit(failed > 0 ? 1 : 0)
