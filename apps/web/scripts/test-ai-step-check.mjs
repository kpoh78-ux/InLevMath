/**
 * Test AI Step Check & Twin Problem Generation
 */

console.log('========================================================================')
console.log('🤖 [검증] AI 수식 첨삭(Step Check) 및 쌍둥이 문제(Twin Problem) 테스트')
console.log('========================================================================\n')

// 1. 정상 풀이 검증 테스트
const correctPayload = {
  questionLatex: '일차방정식 $$3x - 5 = 10$$을 푸시오.',
  answerLatex: 'x = 5',
  studentSolutionSteps: [
    '3x - 5 = 10',
    '3x = 10 + 5',
    '3x = 15',
    'x = 5',
  ],
}

console.log('📌 1. [정상 풀이 과정 첨삭 테스트]')
console.log(`- 문제: ${correctPayload.questionLatex}`)
console.log(`- 학생 풀이 단계: \n  ${correctPayload.studentSolutionSteps.join('\n  ')}`)
console.log('------------------------------------------------------------------------')

// 2. 부호 오류가 포함된 풀이 검증 테스트
const errorPayload = {
  questionLatex: '일차방정식 $$2x + 6 = 14$$를 푸시오.',
  answerLatex: 'x = 4',
  studentSolutionSteps: [
    '2x + 6 = 14',
    '2x = 14 + 6', // Step 2에서 부호 실수 발생 (2x = 20)
    '2x = 20',
    'x = 10',
  ],
}

console.log('\n📌 2. [부호 오류 풀이 과정 첨삭 테스트]')
console.log(`- 문제: ${errorPayload.questionLatex}`)
console.log(`- 학생 풀이 단계: \n  ${errorPayload.studentSolutionSteps.join('\n  ')}`)
console.log('------------------------------------------------------------------------')

// 3. 쌍둥이 문제 생성 테스트 페이로드
const twinPayload = {
  originalQuestionLatex: '이차방정식 $$x^2 - 7x + 12 = 0$$의 두 근을 구하시오.',
  originalAnswer: 'x = 3 또는 x = 4',
  conceptTitle: '이차방정식 인수분해 해법',
  domain: '문자와 식',
  difficulty: 0.35,
}

console.log('\n📌 3. [쌍둥이 변형 문제 자동 합성 테스트]')
console.log(`- 원본 문제: ${twinPayload.originalQuestionLatex}`)
console.log(`- 원본 정답: ${twinPayload.originalAnswer}`)
console.log('========================================================================\n')
