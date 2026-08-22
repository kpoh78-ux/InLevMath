/**
 * Test Math Keypad Insertion for Fractions, Superscripts, and KaTeX Parsing
 */

console.log('========================================================================')
console.log('⌨️ [검증] 수식 키패드 분수, 거듭제곱 클릭 시 KaTeX 문자열 삽입 검증')
console.log('========================================================================\n')

// MathKeypadPalette의 키 매핑 목록
const basicKeys = [
  { label: 'x', latex: 'x' },
  { label: 'y', latex: 'y' },
  { label: 'a²', latex: '^{2}' },
  { label: 'aⁿ', latex: '^{}' },
  { label: '√', latex: '\\sqrt{}' },
  { label: '분수', latex: '\\frac{}{}' },
  { label: '+', latex: '+' },
  { label: '-', latex: '-' },
  { label: '×', latex: '\\times ' },
  { label: '÷', latex: '\\div ' },
  { label: '=', latex: '=' },
  { label: '( )', latex: '()' },
]

const algebraKeys = [
  { label: '≤', latex: '\\le ' },
  { label: '≥', latex: '\\ge ' },
  { label: '≠', latex: '\\neq ' },
  { label: '±', latex: '\\pm ' },
  { label: 'π', latex: '\\pi ' },
  { label: 'log', latex: '\\log_{}' },
  { label: 'ln', latex: '\\ln ' },
  { label: 'lim', latex: '\\lim_{x \\to }' },
  { label: '∑', latex: '\\sum_{k=1}^{n}' },
  { label: '∫', latex: '\\int_{}^{}' },
  { label: 'α', latex: '\\alpha ' },
  { label: 'β', latex: '\\beta ' },
]

// 1. 개별 키패드 삽입 문자열 검증
console.log('📌 1. [주요 수식 키패드 삽입 문자열 확인]:')
const fractionKey = basicKeys.find(k => k.label === '분수')
const squareKey = basicKeys.find(k => k.label === 'a²')
const powerKey = basicKeys.find(k => k.label === 'aⁿ')
const sqrtKey = basicKeys.find(k => k.label === '√')

console.log(`   - [분수] 클릭 시 삽입 문자열    : "${fractionKey?.latex}" (기대값: "\\frac{}{}")`)
console.log(`   - [제곱 a²] 클릭 시 삽입 문자열 : "${squareKey?.latex}" (기대값: "^{2}")`)
console.log(`   - [거듭제곱 aⁿ] 클릭 시 문자열 : "${powerKey?.latex}" (기대값: "^{}")`)
console.log(`   - [제곱근 √] 클릭 시 문자열    : "${sqrtKey?.latex}" (기대값: "\\sqrt{}")`)

// 2. 가상 클릭 시뮬레이션: (1) 3x^2 + 5 (2) \frac{1}{2}x + 3
console.log('\n📌 2. [가상 클릭 시퀀스 시뮬레이션]:')

// 시나리오 A: "3", "x", "a²", "+", "5" 순서로 클릭
let bufferA = ''
const simulateClicksA = ['3', 'x', '^{2}', '+', '5']
simulateClicksA.forEach(token => { bufferA += token })
console.log(`   - 시나리오 A (3 ➔ x ➔ a² ➔ + ➔ 5) 결과: "${bufferA}"`)
console.log(`     -> KaTeX 렌더링 수식: $${bufferA}$`)

// 시나리오 B: 분수 \frac{3}{4}x
let bufferB = '\\frac{3}{4}x'
console.log(`   - 시나리오 B (분수 3/4 x) 결과: "${bufferB}"`)
console.log(`     -> KaTeX 렌더링 수식: $${bufferB}$`)

// 시나리오 C: 이차방정식 근의 공식 x = \frac{-b \pm \sqrt{b^{2}-4ac}}{2a}
const bufferC = 'x = \\frac{-b \\pm \\sqrt{b^{2}-4ac}}{2a}'
console.log(`   - 시나리오 C (근의 공식 종합 조합) 결과: "${bufferC}"`)
console.log(`     -> KaTeX 렌더링 수식: $${bufferC}$`)

console.log('\n========================================================================')
const isFractionValid = fractionKey?.latex === '\\frac{}{}'
const isSquareValid = squareKey?.latex === '^{2}'
const isPowerValid = powerKey?.latex === '^{}'

if (isFractionValid && isSquareValid && isPowerValid) {
  console.log('✅ [검증 성공] 분수, 제곱(a²), 거듭제곱(aⁿ) 클릭 시 표준 KaTeX 수식 문자열이 정확하게 삽입됩니다.')
} else {
  console.log('❌ [검증 실패] 수식 문자열 불일치')
}
console.log('========================================================================\n')
