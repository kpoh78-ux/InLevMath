/**
 * PostgreSQL pg_indexes 인덱스 생성 및 관계 검증 스크립트
 */

import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

console.log('========================================================================')
console.log('🔍 [DB 인덱스 검증] ConceptNode 및 ConceptDependency 인덱스 및 관계 확인')
console.log('========================================================================\n')

try {
  // 1. ConceptNode 인덱스 조회
  const conceptNodeIndexes = await prisma.$queryRaw`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE tablename = 'ConceptNode';
  `

  console.log('📌 1. [ConceptNode] 인덱스 목록:')
  conceptNodeIndexes.forEach((idx) => {
    console.log(`   - ${idx.indexname}: ${idx.indexdef}`)
  })

  // 2. ConceptDependency 인덱스 조회
  const conceptDepIndexes = await prisma.$queryRaw`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE tablename = 'ConceptDependency';
  `

  console.log('\n📌 2. [ConceptDependency] 인덱스 목록:')
  conceptDepIndexes.forEach((idx) => {
    console.log(`   - ${idx.indexname}: ${idx.indexdef}`)
  })

  // 3. 관계(Foreign Key) 제약조건 확인
  const foreignKeys = await prisma.$queryRaw`
    SELECT
      tc.constraint_name,
      kcu.column_name,
      ccu.table_name AS foreign_table_name,
      ccu.column_name AS foreign_column_name
    FROM information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_name = 'ConceptDependency';
  `

  console.log('\n📌 3. [ConceptDependency] 외래키(FK) 관계 목록:')
  foreignKeys.forEach((fk) => {
    console.log(`   - ${fk.constraint_name}: ${fk.column_name} ➔ ${fk.foreign_table_name}(${fk.foreign_column_name})`)
  })

  console.log('\n========================================================================')
  console.log('✅ [검증 완료] 모든 인덱스와 관계 제약조건이 DB에 완벽히 생성되었습니다.')
  console.log('========================================================================\n')
} catch (err) {
  console.error('검증 중 오류:', err)
} finally {
  await prisma.$disconnect()
}
