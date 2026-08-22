// apps/web/scripts/seed-kmath-4tier.mjs
//
// 초3~고3 K-수학 4계층 (대단원 ➡️ 중단원 ➡️ 소단원 ➡️ 문제유형) 시드 스크립트
// 실행: node scripts/seed-kmath-4tier.mjs

import { PrismaClient } from '@prisma/client'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const prisma = new PrismaClient()

const SUBJECT_MAP = {
  'E3-1': 'ELEM_3_1',
  'E3-2': 'ELEM_3_2',
  'E4-1': 'ELEM_4_1',
  'E4-2': 'ELEM_4_2',
  'E5-1': 'ELEM_5_1',
  'E5-2': 'ELEM_5_2',
  'E6-1': 'ELEM_6_1',
  'E6-2': 'ELEM_6_2',
  'M1-1': 'MID_1_1',
  'M1-2': 'MID_1_2',
  'M2-1': 'MID_2_1',
  'M2-2': 'MID_2_2',
  'M3-1': 'MID_3_1',
  'M3-2': 'MID_3_2',
  'H-CM1': 'HIGH_COMMON_1',
  'H-CM2': 'HIGH_COMMON_2',
  'H-ALG': 'HIGH_ALGEBRA',
  'H-CAL1': 'HIGH_CALC_1',
  'H-CAL2': 'HIGH_CALC_2',
  'H-PRB': 'HIGH_PROB_STAT',
  'H-GEO': 'HIGH_GEOMETRY',
}

async function main() {
  console.log('🚀 K-수학 초3~고3 4계층 체계화 시드 시작...')

  const dataPath = path.resolve(__dirname, '../prisma/data/math-taxonomy.json')
  if (!fs.existsSync(dataPath)) {
    console.error(`❌ 데이터 파일을 찾을 수 없습니다: ${dataPath}`)
    process.exit(1)
  }

  const raw = JSON.parse(fs.readFileSync(dataPath, 'utf-8'))
  const nodes = raw.nodes || []

  // 초3 이상 필터링
  const validNodes = nodes.filter(n => {
    const prefix = n.code.split('-').slice(0, 2).join('-')
    return Boolean(SUBJECT_MAP[prefix])
  })

  console.log(`총 ${nodes.length}개 노드 중 초3~고3 해당 노드: ${validNodes.length}개`)

  // 1. 대단원 맵: majorCode -> { subject, orderIndex, name }
  const majorMap = new Map()
  // 2. 중단원 맵: middleCode -> { majorCode, orderIndex, name }
  const middleMap = new Map()
  // 3. 소단원 맵: subCode -> { middleCode, orderIndex, name }
  const subMap = new Map()
  // 4. 문제유형 목록: { subCode, typeCode, typeName, difficulty }
  const patternList = []

  for (const n of validNodes) {
    const parts = n.code.split('-')
    // 예: M2-1-01-02-01-03
    // prefix: M2-1, majorIdx: 01, middleIdx: 02, subIdx: 01, patternIdx: 03
    // 또는 H-CM1-01-02-01-03
    let subjKey, majIdx, midIdx, subIdx, patIdx

    if (n.code.startsWith('H-')) {
      subjKey = parts[0] + '-' + parts[1]
      majIdx = parts[2]
      midIdx = parts[3]
      subIdx = parts[4]
      patIdx = parts[5]
    } else {
      subjKey = parts[0] + '-' + parts[1]
      majIdx = parts[2]
      midIdx = parts[3]
      subIdx = parts[4]
      patIdx = parts[5]
    }

    const subject = SUBJECT_MAP[subjKey]
    if (!subject) continue

    const majorCode = `${subjKey}_MAJ_${majIdx}`
    const middleCode = `${subjKey}_MID_${majIdx}_${midIdx}`
    const subCode = `${subjKey}_SUB_${majIdx}_${midIdx}_${subIdx}`
    const typeCode = `TYP_${subjKey}_${majIdx}_${midIdx}_${subIdx}_${patIdx}`

    if (!majorMap.has(majorCode)) {
      majorMap.set(majorCode, {
        code: majorCode,
        subject,
        orderIndex: parseInt(majIdx, 10) || 1,
        name: n.majorUnit || `대단원 ${majIdx}`,
      })
    }

    if (!middleMap.has(middleCode)) {
      middleMap.set(middleCode, {
        code: middleCode,
        majorCode,
        orderIndex: parseInt(midIdx, 10) || 1,
        name: n.middleUnit || `중단원 ${midIdx}`,
      })
    }

    if (!subMap.has(subCode)) {
      subMap.set(subCode, {
        code: subCode,
        middleCode,
        orderIndex: parseInt(subIdx, 10) || 1,
        name: n.typeName || `소단원 ${subIdx}`,
      })
    }

    patternList.push({
      typeCode,
      subCode,
      typeName: n.title || `유형 ${patIdx}`,
      difficulty: n.difficulty || 2,
    })
  }

  console.log(`📊 계층 구조 집계 완료:`)
  console.log(`- 대단원: ${majorMap.size}개`)
  console.log(`- 중단원: ${middleMap.size}개`)
  console.log(`- 소단원: ${subMap.size}개`)
  console.log(`- 문제유형: ${patternList.length}개`)

  // DB Insert / Upsert
  // 1. 대단원
  const majorIdMap = new Map()
  for (const m of majorMap.values()) {
    const rec = await prisma.mathMajorUnit.upsert({
      where: { code: m.code },
      create: {
        code: m.code,
        subject: m.subject,
        orderIndex: m.orderIndex,
        name: m.name,
      },
      update: {
        subject: m.subject,
        orderIndex: m.orderIndex,
        name: m.name,
      },
    })
    majorIdMap.set(m.code, rec.id)
  }
  console.log(`✅ 대단원 ${majorMap.size}개 저장 완료`)

  // 2. 중단원
  const middleIdMap = new Map()
  for (const mid of middleMap.values()) {
    const majorUnitId = majorIdMap.get(mid.majorCode)
    if (!majorUnitId) continue
    const rec = await prisma.mathMiddleUnit.upsert({
      where: { code: mid.code },
      create: {
        code: mid.code,
        majorUnitId,
        orderIndex: mid.orderIndex,
        name: mid.name,
      },
      update: {
        majorUnitId,
        orderIndex: mid.orderIndex,
        name: mid.name,
      },
    })
    middleIdMap.set(mid.code, rec.id)
  }
  console.log(`✅ 중단원 ${middleMap.size}개 저장 완료`)

  // 3. 소단원
  const subIdMap = new Map()
  for (const sub of subMap.values()) {
    const middleUnitId = middleIdMap.get(sub.middleCode)
    if (!middleUnitId) continue
    const rec = await prisma.mathSubUnit.upsert({
      where: { code: sub.code },
      create: {
        code: sub.code,
        middleUnitId,
        orderIndex: sub.orderIndex,
        name: sub.name,
      },
      update: {
        middleUnitId,
        orderIndex: sub.orderIndex,
        name: sub.name,
      },
    })
    subIdMap.set(sub.code, rec.id)
  }
  console.log(`✅ 소단원 ${subMap.size}개 저장 완료`)

  // 4. 문제유형
  let patternCount = 0
  for (const pat of patternList) {
    const subUnitId = subIdMap.get(pat.subCode)
    if (!subUnitId) continue
    await prisma.mathPatternType.upsert({
      where: { typeCode: pat.typeCode },
      create: {
        typeCode: pat.typeCode,
        subUnitId,
        typeName: pat.typeName,
        difficulty: pat.difficulty,
      },
      update: {
        subUnitId,
        typeName: pat.typeName,
        difficulty: pat.difficulty,
      },
    })
    patternCount++
  }
  console.log(`✅ 문제유형 ${patternCount}개 저장 완료`)
  console.log('🎉 초3~고3 K-수학 4계층 체계화 완료!')
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
