/**
 * Test Step Check API for Sign Error at Step 2
 */

import { checkStudentSolutionSteps } from '../src/lib/stepCheck.ts'

console.log('========================================================================')
console.log('🧪 [검증] 부호 실수가 포함된 3줄 풀이 전송 시 firstErrorStep: 2 & SIGN_ERROR 감지')
console.log('========================================================================\n')

const testPayload = {
  questionLatex: '일차방정식 $2x + 6 = 14$를 푸시오.',
  answerLatex: '$x = 4$',
  studentSolutionSteps: [
    '2x + 6 = 14',
    '2x = 14 + 6', // Step 2: 이항 시 부호 실수 (+6 -> -6이어야 하나 +6 유지)
    'x = 10',      // Step 3: 계산 결과
  ],
}

const data = await checkStudentSolutionSteps(
  testPayload.questionLatex,
  testPayload.answerLatex,
  testPayload.studentSolutionSteps
)


console.log('📥 [요청 학생 풀이 3줄]:')
testPayload.studentSolutionSteps.forEach((s, idx) => {
  const marker = idx === 1 ? '⚠️ (오류 유발 지점)' : ''
  console.log(`   Step ${idx + 1}: ${s} ${marker}`)
})

console.log('\n📤 [AI 첨삭 응답 결과]:')
console.log(`- isFullyCorrect        : ${data.isFullyCorrect}`)
console.log(`- firstErrorStep        : ${data.firstErrorStep} (기대값: 2)`)
console.log(`- errorType             : ${data.errorType} (기대값: SIGN_ERROR)`)
console.log(`- diagnosticExplanation : ${data.diagnosticExplanation}`)
console.log(`- 3단계 점진적 힌트     :`)
data.hints.forEach((h, i) => console.log(`   ${h}`))

console.log('\n📍 [줄별 상태]:')
data.stepFeedbacks.forEach(sf => {
  console.log(`   Step ${sf.step}: [${sf.isValid ? '✅ 정상' : '❌ 오류'}] ${sf.feedback}`)
})

console.log('\n========================================================================')
const isSuccess = data.firstErrorStep === 2 && data.errorType === 'SIGN_ERROR'
console.log(isSuccess ? '✅ [검증 성공] firstErrorStep: 2 및 SIGN_ERROR가 정확하게 감지되었습니다!' : '❌ [검증 실패]')
console.log('========================================================================\n')
