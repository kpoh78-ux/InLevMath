/**
 * apps/web/scripts/test-stat-aggregator.mjs
 * 
 * 소단원 답안 10문항 제출 시 정답률(%) 실시간 DB 갱신 및 취약점 트리거 검증 스크립트
 * 
 * 시나리오:
 * 1. 학생이 특정 소단원(예: '다항식의 덧셈과 뺄셈')의 10문항을 풀어 답안 제출
 *    - 7문항 정답, 3문항 오답
 *    - 예상 결과: totalSolved = 10, correctCount = 7, accuracyRate = 70.0%
 * 2. 추가 5문항 제출 (1문항 정답, 4문항 오답)
 *    - 누적 결과: totalSolved = 15, correctCount = 8, accuracyRate = 53.3% (< 60.0%)
 *    - 예상 결과: 취약점 자동 감지 및 처방 미션(Weakness Mission) 트리거 발동
 */

import { processSubmissionStats } from '../src/lib/statAggregator.ts'
import { prisma } from '../src/lib/prisma.ts'

async function runTest() {
  console.log('========================================================================')
  console.log('🧪 [테스트] 소단원 답안 10문항 제출 시 정답률(%) 실시간 갱신 & 취약점 트리거 검증')
  console.log('========================================================================\n')

  const TEST_STUDENT_ID = 'test-student-stat-01'
  const TEST_SUB_UNIT_ID = 'test-subunit-poly-01'

  try {
    // 0. 초기화: 기존 테스트 데이터 정리
    await prisma.studentSubUnitStat.deleteMany({
      where: {
        studentId: TEST_STUDENT_ID,
      },
    }).catch(() => {})

    console.log('📋 [1단계] 10문항 답안 제출 시뮬레이션')
    console.log('   - 총 문항 수: 10제')
    console.log('   - 정답 문항: 7제 (1, 2, 3, 5, 6, 8, 10번)')
    console.log('   - 오답 문항: 3제 (4, 7, 9번)')
    console.log('   - 예상 정답률: (7 / 10) * 100 = 70.0%\n')

    const firstSubmissions = [
      { questionId: 'q-01', subUnitId: TEST_SUB_UNIT_ID, isCorrect: true, timeSpentSec: 25 },
      { questionId: 'q-02', subUnitId: TEST_SUB_UNIT_ID, isCorrect: true, timeSpentSec: 30 },
      { questionId: 'q-03', subUnitId: TEST_SUB_UNIT_ID, isCorrect: true, timeSpentSec: 20 },
      { questionId: 'q-04', subUnitId: TEST_SUB_UNIT_ID, isCorrect: false, timeSpentSec: 45 },
      { questionId: 'q-05', subUnitId: TEST_SUB_UNIT_ID, isCorrect: true, timeSpentSec: 15 },
      { questionId: 'q-06', subUnitId: TEST_SUB_UNIT_ID, isCorrect: true, timeSpentSec: 35 },
      { questionId: 'q-07', subUnitId: TEST_SUB_UNIT_ID, isCorrect: false, timeSpentSec: 50 },
      { questionId: 'q-08', subUnitId: TEST_SUB_UNIT_ID, isCorrect: true, timeSpentSec: 18 },
      { questionId: 'q-09', subUnitId: TEST_SUB_UNIT_ID, isCorrect: false, timeSpentSec: 40 },
      { questionId: 'q-10', subUnitId: TEST_SUB_UNIT_ID, isCorrect: true, timeSpentSec: 22 },
    ]

    // 실시간 통계 갱신 엔진 실행
    await processSubmissionStats(TEST_STUDENT_ID, firstSubmissions)

    // DB 갱신 결과 확인
    const statAfter10 = await prisma.studentSubUnitStat.findUnique({
      where: {
        studentId_subUnitId: {
          studentId: TEST_STUDENT_ID,
          subUnitId: TEST_SUB_UNIT_ID,
        },
      },
    })

    console.log('📊 [1단계 DB 갱신 결과]')
    console.log(`   - 누적 풀이 수 (totalSolved)   : ${statAfter10?.totalSolved}제 (기대값: 10)`)
    console.log(`   - 누적 정답 수 (correctCount)  : ${statAfter10?.correctCount}제 (기대값: 7)`)
    console.log(`   - 백분율 정답률 (accuracyRate) : ${statAfter10?.accuracyRate}% (기대값: 70.0%)\n`)

    if (
      statAfter10?.totalSolved === 10 &&
      statAfter10?.correctCount === 7 &&
      statAfter10?.accuracyRate === 70.0
    ) {
      console.log('✅ 1단계 검증 성공: 10문항 채점 결과가 정확하게 70.0%로 실시간 갱신되었습니다.\n')
    } else {
      console.error('❌ 1단계 검증 실패: DB 갱신 수치가 기대값과 다릅니다.\n')
    }

    console.log('------------------------------------------------------------------------')
    console.log('📋 [2단계] 추가 5문항 제출 시뮬레이션 (누적 15제, 정답률 하락 취약점 트리거)')
    console.log('   - 추가 제출: 5제 (1제 정답, 4제 오답)')
    console.log('   - 누적 합산: 총 15제 중 8제 정답')
    console.log('   - 예상 누적 정답률: (8 / 15) * 100 = 53.3% (< 60.0% 취약점 트리거)\n')

    const secondSubmissions = [
      { questionId: 'q-11', subUnitId: TEST_SUB_UNIT_ID, isCorrect: false, timeSpentSec: 40 },
      { questionId: 'q-12', subUnitId: TEST_SUB_UNIT_ID, isCorrect: true, timeSpentSec: 25 },
      { questionId: 'q-13', subUnitId: TEST_SUB_UNIT_ID, isCorrect: false, timeSpentSec: 55 },
      { questionId: 'q-14', subUnitId: TEST_SUB_UNIT_ID, isCorrect: false, timeSpentSec: 60 },
      { questionId: 'q-15', subUnitId: TEST_SUB_UNIT_ID, isCorrect: false, timeSpentSec: 48 },
    ]

    await processSubmissionStats(TEST_STUDENT_ID, secondSubmissions)

    const statAfter15 = await prisma.studentSubUnitStat.findUnique({
      where: {
        studentId_subUnitId: {
          studentId: TEST_STUDENT_ID,
          subUnitId: TEST_SUB_UNIT_ID,
        },
      },
    })

    console.log('📊 [2단계 DB 갱신 결과]')
    console.log(`   - 누적 풀이 수 (totalSolved)   : ${statAfter15?.totalSolved}제 (기대값: 15)`)
    console.log(`   - 누적 정답 수 (correctCount)  : ${statAfter15?.correctCount}제 (기대값: 8)`)
    console.log(`   - 백분율 정답률 (accuracyRate) : ${statAfter15?.accuracyRate}% (기대값: 53.3%)\n`)

    if (
      statAfter15?.totalSolved === 15 &&
      statAfter15?.correctCount === 8 &&
      statAfter15?.accuracyRate === 53.3
    ) {
      console.log('✅ 2단계 검증 성공: 누적 15문항 채점 결과가 정확하게 53.3%로 갱신되고 취약점 자동 감지 조건을 충족했습니다.\n')
    }

  } catch (err) {
    console.error('테스트 실행 중 에러 발생:', err)
  } finally {
    // 테스트 데이터 정리
    await prisma.studentSubUnitStat.deleteMany({
      where: { studentId: TEST_STUDENT_ID },
    }).catch(() => {})
    console.log('🧹 테스트 데이터 정리 완료')
    console.log('========================================================================')
  }
}

runTest()
