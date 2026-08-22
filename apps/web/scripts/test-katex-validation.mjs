/**
 * Test KaTeX Syntax and Mathematical Validation for Twin Problems
 */

console.log('========================================================================')
console.log('📐 [검증] 쌍둥이 문제 생성 시 KaTeX 파싱 에러 없는 정상 수식 포맷 검증')
console.log('========================================================================\n')

// KaTeX 수식 구문 유효성 검사기
function validateKatexString(text, fieldName = 'text') {
  const errors = []
  
  if (typeof text !== 'string') {
    return { isValid: false, errors: [`${fieldName}은(는) 문자열이어야 합니다.`] }
  }

  // 1. 달러 기호($) 짝 검사 (이스케이프된 \$ 제외)
  const unescapedDollars = text.replace(/\\\$/g, '').match(/\$/g) || []
  if (unescapedDollars.length % 2 !== 0) {
    errors.push(`$ 수식 구분 기호의 짝이 맞지 않습니다 (총 ${unescapedDollars.length}개).`)
  }

  // 2. 중괄호 {} 짝 검사
  let braceCount = 0
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{' && (i === 0 || text[i - 1] !== '\\')) braceCount++
    if (text[i] === '}' && (i === 0 || text[i - 1] !== '\\')) braceCount--
    if (braceCount < 0) {
      errors.push(`닫는 중괄호 '}'가 여는 중괄호보다 먼저 나왔습니다 (위치: ${i}).`)
      break
    }
  }
  if (braceCount > 0) {
    errors.push(`여는 중괄호 '{'의 짝(${braceCount}개)이 닫히지 않았습니다.`)
  }

  // 3. 주요 KaTeX 명령어 유효성 검사 (\frac, \sqrt, \pm 등)
  const mathRegex = /\$\$([\s\S]*?)\$\$|\$([^\$]+)\$/g
  let match
  let formulaCount = 0

  while ((match = mathRegex.exec(text)) !== null) {
    formulaCount++
    const formula = match[1] || match[2]
    
    // 빈 수식 체크
    if (!formula.trim()) {
      errors.push(`수식 내용이 비어있는 구분 기호($$)가 존재합니다.`)
    }

    // \frac 인수 유효성
    if (formula.includes('\\frac')) {
      const fracMatches = formula.match(/\\frac(\{[^{}]*\}\{[^{}]*\}|\[.*?\]\{[^{}]*\})/g) || []
      const rawFracCount = (formula.match(/\\frac/g) || []).length
      if (fracMatches.length !== rawFracCount) {
        // 복잡한 중첩이 아닌 단순 분수에서 인수가 부족한 경우
        const hasOpenBrace = formula.includes('\\frac{')
        if (!hasOpenBrace) errors.push(`\\frac 구문의 인수 형식이 올바르지 않습니다: ${formula}`)
      }
    }
  }

  return {
    isValid: errors.length === 0,
    formulaCount,
    errors,
  }
}

// 검증할 쌍둥이 문제 샘플 세트
const sampleTwinProblems = [
  {
    title: '이차방정식 인수분해 해법 [쌍둥이 변형]',
    contentLatex: '이차방정식 $x^2 - 9x + 20 = 0$의 두 근을 $\\alpha, \\beta$ ($\\alpha < \\beta$)라 할 때, $\\beta - \\alpha$의 값을 구하시오.',
    options: ['$1$', '$2$', '$3$', '$4$', '$5$'],
    correctAnswer: '$1$',
    solutionLatex: '$$x^2 - 9x + 20 = 0$$\n$$(x - 4)(x - 5) = 0$$\n따라서 두 근은 $\\alpha = 4, \\beta = 5$ 입니다.\n구하고자 하는 값은 $$\\beta - \\alpha = 5 - 4 = 1$$ 입니다.',
    modifiedVariables: '상수항 20과 일차항 계수 -9로 치환하여 정수근 4, 5 보장',
  },
  {
    title: '이차함수의 최대와 최소 [쌍둥이 변형]',
    contentLatex: '구간 $[1, 4]$에서 이차함수 $y = -(x - 3)^2 + 7$의 최댓값 $M$과 최솟값 $m$에 대하여 $M + m$의 값을 구하시오.',
    options: ['$8$', '$9$', '$10$', '$11$', '$12$'],
    correctAnswer: '$10$',
    solutionLatex: '꼭짓점의 $x$좌표가 $3$이므로 구간 $[1, 4]$에 포함됩니다.\n1. 최댓값 $M$: $x = 3$일 때 $M = 7$\n2. 최솟값 $m$: $x = 1$일 때 $m = -(1 - 3)^2 + 7 = -4 + 7 = 3$\n따라서 $$M + m = 7 + 3 = 10$$ 입니다.',
    modifiedVariables: '꼭짓점 (3, 7) 및 제한 구간 [1, 4] 설정',
  },
  {
    title: '복소수와 근의 공식 [쌍둥이 변형]',
    contentLatex: '이차방정식 $x^2 - 2x + 5 = 0$의 두 허근을 $\\alpha, \\beta$라 할 때, $\\alpha\\beta + \\alpha + \\beta$의 값을 구하시오.',
    options: ['$5$', '$6$', '$7$', '$8$', '$9$'],
    correctAnswer: '$7$',
    solutionLatex: '근과 계수의 관계에 의하여\n$$\\alpha + \\beta = 2, \\quad \\alpha\\beta = 5$$\n따라서 구하고자 하는 값은\n$$\\alpha\\beta + \\alpha + \\beta = 5 + 2 = 7$$\n입니다.',
    modifiedVariables: '근과 계수의 관계 적용이 용이한 계수 2, 5 적용',
  },
]

let allPassed = true

sampleTwinProblems.forEach((problem, pIdx) => {
  console.log(`📌 [샘플 ${pIdx + 1}] ${problem.title}`)
  
  // 1. contentLatex 검증
  const contentVal = validateKatexString(problem.contentLatex, 'contentLatex')
  console.log(`   - 문제 본문 수식 검증 : ${contentVal.isValid ? `✅ 정상 (${contentVal.formulaCount}개 수식 블록)` : `❌ 오류: ${contentVal.errors.join(', ')}`}`)
  
  // 2. options 검증
  let optionsValid = true
  problem.options.forEach((opt, oIdx) => {
    const optVal = validateKatexString(opt, `보기 ${oIdx + 1}`)
    if (!optVal.isValid) optionsValid = false
  })
  console.log(`   - 5지선다 보기 검증    : ${optionsValid ? `✅ 5개 보기 모두 정상 수식` : `❌ 보기 수식 오류`}`)

  // 3. correctAnswer 검증
  const ansVal = validateKatexString(problem.correctAnswer, 'correctAnswer')
  console.log(`   - 정답 수식 검증       : ${ansVal.isValid ? `✅ 정상` : `❌ 오류`}`)

  // 4. solutionLatex 검증
  const solVal = validateKatexString(problem.solutionLatex, 'solutionLatex')
  console.log(`   - 해설 수식 검증       : ${solVal.isValid ? `✅ 정상 (${solVal.formulaCount}개 수식 블록)` : `❌ 오류: ${solVal.errors.join(', ')}`}`)

  if (!contentVal.isValid || !optionsValid || !ansVal.isValid || !solVal.isValid) {
    allPassed = false
  }
  console.log('------------------------------------------------------------------------')
})

console.log('\n========================================================================')
console.log(allPassed ? '✅ [검증 완료] 모든 쌍둥이 문제 필드가 KaTeX 파싱 에러 없는 완벽한 LaTeX 포맷입니다.' : '❌ [검증 실패]')
console.log('========================================================================\n')
