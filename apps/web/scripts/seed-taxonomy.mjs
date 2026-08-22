/**
 * apps/web/scripts/seed-taxonomy.mjs
 * 2022 개정 교육과정 수학 유형 분류 → ConceptNode / ConceptDependency 시드
 *
 *   node scripts/seed-taxonomy.mjs           기존 노드는 건너뛰고 없는 것만 넣는다
 *   node scripts/seed-taxonomy.mjs --update  이미 있는 노드의 내용도 최신으로 갱신
 *   node scripts/seed-taxonomy.mjs --reset   이 데이터셋의 노드를 지우고 다시 넣는다
 *
 * 여러 번 실행해도 결과가 같다(멱등). 다른 출처의 ConceptNode 는 건드리지 않는다.
 */
import { PrismaClient } from '@prisma/client'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const prisma = new PrismaClient()
const here = path.dirname(fileURLToPath(import.meta.url))
const DATA_PATH = path.join(here, '..', 'prisma', 'data', 'math-taxonomy.json')

const args = new Set(process.argv.slice(2))
const UPDATE = args.has('--update')
const RESET = args.has('--reset')
const CHUNK = 300

const chunk = (arr, n) =>
  Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n))

const cleanNode = (n) => {
  const { difficultyLabel, ...valid } = n
  return {
    ...valid,
    achievementStandards: typeof valid.achievementStandards === 'string'
      ? valid.achievementStandards
      : JSON.stringify(valid.achievementStandards || []),
  }
}

async function main() {
  const raw = await readFile(DATA_PATH, 'utf-8')
  const { meta, nodes, edges } = JSON.parse(raw)

  console.log('━'.repeat(64))
  console.log(`📚 ${meta.curriculum}`)
  console.log(`   범위: ${meta.scope}`)
  console.log(`   노드 ${nodes.length}개 · 간선 ${edges.length}개`)
  console.log('━'.repeat(64))

  const codes = nodes.map((n) => n.code)

  if (RESET) {
    // ConceptDependency 는 onDelete: Cascade 라서 노드를 지우면 함께 사라진다
    const gone = await prisma.conceptNode.deleteMany({ where: { code: { in: codes } } })
    console.log(`🧹 기존 노드 ${gone.count}개 삭제`)
  }

  // ── 1. 노드 ────────────────────────────────────────────────────────────────
  const before = await prisma.conceptNode.findMany({
    where: { code: { in: codes } },
    select: { code: true },
  })
  const existing = new Set(before.map((n) => n.code))
  const toCreate = nodes.filter((n) => !existing.has(n.code)).map(cleanNode)

  let created = 0
  for (const part of chunk(toCreate, CHUNK)) {
    const res = await prisma.conceptNode.createMany({ data: part, skipDuplicates: true })
    created += res.count
    process.stdout.write(`\r📥 노드 생성 ${created}/${toCreate.length}`)
  }
  if (toCreate.length) process.stdout.write('\n')
  console.log(`✅ 노드 — 새로 ${created}개, 이미 있던 것 ${existing.size}개`)

  if (UPDATE && existing.size) {
    let updated = 0
    for (const n of nodes.filter((x) => existing.has(x.code)).map(cleanNode)) {
      const { code, ...rest } = n
      await prisma.conceptNode.update({ where: { code }, data: rest })
      if (++updated % 100 === 0) process.stdout.write(`\r♻️  갱신 ${updated}/${existing.size}`)
    }
    process.stdout.write(`\r♻️  갱신 ${updated}/${existing.size}\n`)
  }

  // ── 2. 간선 ────────────────────────────────────────────────────────────────
  // code → id 로 바꿔야 ConceptDependency 에 넣을 수 있다
  const all = await prisma.conceptNode.findMany({
    where: { code: { in: codes } },
    select: { id: true, code: true },
  })
  const idOf = new Map(all.map((n) => [n.code, n.id]))

  const deps = []
  const missing = []
  for (const e of edges) {
    const a = idOf.get(e.prerequisite)
    const b = idOf.get(e.successor)
    if (!a || !b) {
      missing.push(e)
      continue
    }
    deps.push({
      prerequisiteId: a,
      successorId: b,
      weight: e.weight,
      dependencyType: e.dependencyType,
    })
  }
  if (missing.length) console.warn(`⚠️  노드를 못 찾아 건너뛴 간선 ${missing.length}개`)

  let linked = 0
  for (const part of chunk(deps, CHUNK)) {
    const res = await prisma.conceptDependency.createMany({ data: part, skipDuplicates: true })
    linked += res.count
    process.stdout.write(`\r🔗 간선 연결 ${linked}/${deps.length}`)
  }
  if (deps.length) process.stdout.write('\n')
  console.log(`✅ 간선 — 새로 ${linked}개, 이미 있던 것 ${deps.length - linked}개`)

  // ── 3. 확인 ────────────────────────────────────────────────────────────────
  const [nodeCount, depCount] = await Promise.all([
    prisma.conceptNode.count({ where: { code: { in: codes } } }),
    prisma.conceptDependency.count(),
  ])
  const byDiff = await prisma.conceptNode.groupBy({
    by: ['difficulty'],
    where: { code: { in: codes } },
    _count: true,
    orderBy: { difficulty: 'asc' },
  })

  console.log('━'.repeat(64))
  console.log(`📊 DB 상태 — 노드 ${nodeCount}개 / 전체 간선 ${depCount}개`)
  console.log(
    '   난이도: ' +
      byDiff.map((d) => `${{ 1: '하', 2: '중', 3: '상' }[d.difficulty]} ${d._count}`).join(' · ')
  )
  if (nodeCount !== nodes.length) {
    console.warn(`⚠️  기대 ${nodes.length}개와 다릅니다. --reset 으로 다시 넣어보세요.`)
  } else {
    console.log('🎉 완료 — knowledgeGraph.ts 의 역추적 엔진을 바로 쓸 수 있습니다.')
  }
  console.log('━'.repeat(64))
}

main()
  .catch((e) => {
    console.error('\n❌ 실패:', e.message)
    if (String(e.message).includes('difficulty')) {
      console.error('   → schema-additions.prisma 를 붙여넣고')
      console.error('     npx prisma migrate dev --name add_math_taxonomy 를 먼저 실행하세요.')
    }
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
