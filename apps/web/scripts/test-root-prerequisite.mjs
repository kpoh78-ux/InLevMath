/**
 * Test traceRootPrerequisiteDeficit
 */

import { traceRootPrerequisiteDeficit } from '../src/lib/knowledgeGraph.ts'

console.log('========================================================================')
console.log('🧪 [테스트] traceRootPrerequisiteDeficit 선수 개념 역추적 검증')
console.log('========================================================================\n')

const testCodes = [
  'MATH-H1-FMAX-004', // 고1 이차함수의 최대최소
  'MATH-H1-QINEQ-005', // 고1 이차부등식
  'MATH-M3-QFUNC-004', // 중3 이차함수
]

for (const code of testCodes) {
  const result = await traceRootPrerequisiteDeficit(code, 4)
  console.log(`🎯 대상 개념: ${code}`)
  console.log(`   - Root Deficit Node : [${result.rootDeficitNode.gradeLevel || 'GRADE'}] ${result.rootDeficitNode.title} (${result.rootDeficitNode.code})`)
  console.log(`   - Backtrack Depth   : ${result.backtrackDepth}`)
  console.log(`   - Causal Path       : ${result.causalPath.join(' -> ')}`)
  console.log('------------------------------------------------------------------------')
}
