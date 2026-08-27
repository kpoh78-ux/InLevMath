#!/usr/bin/env node
//
// ClassSchedule.studentNames (이름 문자열 배열) → ClassScheduleStudent (관계) 이관.
//
// 동명이인이 있으면 어느 학생인지 가릴 수 없다. 그런 이름은 채우지 않고 목록에 남겨
// 사람이 화면에서 직접 고르게 한다 — 임의로 한 명을 골라 넣으면 엉뚱한 학생의
// 출결·리포트가 섞인다.
//
//   확인만 (아무것도 바꾸지 않음)
//     node scripts/backfill-schedule-students.mjs
//
//   실제로 채우기
//     node scripts/backfill-schedule-students.mjs --apply

import { readFileSync, existsSync } from 'node:fs'
import { PrismaClient } from '@prisma/client'

if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/.exec(line.trim())
    if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, '')
  }
}

const apply = process.argv.includes('--apply')
const prisma = new PrismaClient()

const schedules = await prisma.classSchedule.findMany({
  select: { id: true, dayOfWeek: true, startTime: true, subject: true, grade: true, studentNames: true },
  orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
})

const students = await prisma.student.findMany({
  where: { status: 'active' },
  select: { id: true, grade: true, user: { select: { name: true } } },
})

// 이름 → 학생들. 동명이인이면 배열이 2개 이상이 된다
const byName = new Map()
for (const s of students) {
  const n = s.user.name.trim()
  if (!byName.has(n)) byName.set(n, [])
  byName.get(n).push(s)
}

const DAYS = ['월', '화', '수', '목', '금', '토', '일']
const pairs = []
const ambiguous = []
const missing = []

for (const sc of schedules) {
  let names = []
  try { names = JSON.parse(sc.studentNames) } catch { names = [] }
  if (!Array.isArray(names)) names = []

  for (const raw of names) {
    const name = String(raw ?? '').trim()
    if (!name) continue

    const found = byName.get(name) ?? []
    const where = `${DAYS[sc.dayOfWeek]} ${sc.startTime} ${sc.subject}`

    if (found.length === 1) {
      pairs.push({ scheduleId: sc.id, studentId: found[0].id })
    } else if (found.length > 1) {
      // 학년이 수업 학년과 같은 학생이 딱 한 명이면 그 학생으로 좁힌다
      const sameGrade = found.filter(s => s.grade === sc.grade)
      if (sameGrade.length === 1) {
        pairs.push({ scheduleId: sc.id, studentId: sameGrade[0].id })
      } else {
        ambiguous.push({ where, name, count: found.length, grades: found.map(s => s.grade).join('/') })
      }
    } else {
      missing.push({ where, name })
    }
  }
}

console.log('')
console.log(`  수업 ${schedules.length}개 · 재원 학생 ${students.length}명`)
console.log(`  이관 가능 ${pairs.length}건 · 동명이인 ${ambiguous.length}건 · 못 찾음 ${missing.length}건`)

if (ambiguous.length) {
  console.log('\n  ■ 동명이인이라 채우지 않음 — 시간표 화면에서 직접 고르세요')
  for (const a of ambiguous) console.log(`     ${a.where.padEnd(22)} ${a.name} (${a.count}명, 학년 ${a.grades})`)
}
if (missing.length) {
  console.log('\n  ■ 재원 학생에서 못 찾음 — 퇴원했거나 이름이 다릅니다')
  for (const m of missing) console.log(`     ${m.where.padEnd(22)} ${m.name}`)
}

if (!apply) {
  console.log('\n  확인만 했습니다. 실제로 채우려면 --apply 를 붙이세요.')
  await prisma.$disconnect()
  process.exit(0)
}

const before = await prisma.classScheduleStudent.count()
await prisma.classScheduleStudent.createMany({ data: pairs, skipDuplicates: true })
const after = await prisma.classScheduleStudent.count()

console.log(`\n  이관 완료 — ${after - before}건 추가 (전체 ${after}건)`)
if (ambiguous.length || missing.length) {
  console.log('  위에 적힌 건은 화면에서 직접 연결해야 합니다.')
}
await prisma.$disconnect()
