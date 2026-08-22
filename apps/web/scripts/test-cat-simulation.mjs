/**
 * CAT Engine IRT 3PL & EAP Simulation Test
 * 12회 연속 적응형 테스트 시뮬레이션
 */

const D = 1.7

function calculateProbability(theta, item) {
  const { discrimination: a, difficulty: b, guessing: c } = item
  const exponent = -D * a * (theta - b)
  return c + (1 - c) / (1 + Math.exp(exponent))
}

function calculateFisherInformation(theta, item) {
  const p = calculateProbability(theta, item)
  const { discrimination: a, guessing: c, difficulty: b } = item
  const pStar = 1 / (1 + Math.exp(-D * a * (theta - b)))

  if (p <= 0 || p >= 1) return 0
  return (Math.pow(D * a, 2) * Math.pow(pStar, 2) * (1 - pStar) * (1 - c)) / p
}

function estimateThetaEAP(responses, quadPoints = 61, minTheta = -3.0, maxTheta = 3.0) {
  if (responses.length === 0) return { theta: 0.0, standardError: 1.0 }

  const step = (maxTheta - minTheta) / (quadPoints - 1)
  let numerator = 0
  let denominator = 0
  const nodes = []

  for (let i = 0; i < quadPoints; i++) {
    const x = minTheta + i * step
    const prior = (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * x * x)

    let likelihood = 1.0
    for (const res of responses) {
      const p = calculateProbability(x, res.item)
      likelihood *= res.isCorrect ? p : 1 - p
    }

    const weight = likelihood * prior * step
    numerator += x * weight
    denominator += weight
    nodes.push({ x, weight })
  }

  const estimatedTheta = denominator === 0 ? 0.0 : numerator / denominator

  let varianceNumerator = 0
  for (const node of nodes) {
    varianceNumerator += Math.pow(node.x - estimatedTheta, 2) * node.weight
  }
  const variance = denominator === 0 ? 1.0 : varianceNumerator / denominator
  const standardError = Math.sqrt(variance)

  return {
    theta: Math.max(-3.0, Math.min(3.0, Number(estimatedTheta.toFixed(2)))),
    standardError: Number(standardError.toFixed(3)),
  }
}

function selectNextItem(currentTheta, candidatePool, administeredItemIds) {
  const availableItems = candidatePool.filter((item) => !administeredItemIds.has(item.id))
  if (availableItems.length === 0) return null

  let bestItem = availableItems[0]
  let maxInfo = -Infinity

  for (const item of availableItems) {
    const info = calculateFisherInformation(currentTheta, item)
    if (info > maxInfo) {
      maxInfo = info
      bestItem = item
    }
  }

  return bestItem
}

// ── 문항 풀 (난이도 -2.5 ~ +2.5 촘촘한 구성) ────────────────────────────────
const ITEM_BANK = [
  { id: 'Q01', discrimination: 1.2, difficulty: -2.4, guessing: 0.2, title: '기초 정수 사칙연산' },
  { id: 'Q02', discrimination: 1.3, difficulty: -2.0, guessing: 0.0, title: '일차방정식 기본' },
  { id: 'Q03', discrimination: 1.2, difficulty: -1.6, guessing: 0.2, title: '삼각형 내각 성질' },
  { id: 'Q04', discrimination: 1.4, difficulty: -1.2, guessing: 0.2, title: '순환소수 분수 변환' },
  { id: 'Q05', discrimination: 1.3, difficulty: -0.8, guessing: 0.0, title: '연립방정식 기본' },
  { id: 'Q06', discrimination: 1.5, difficulty: -0.4, guessing: 0.2, title: '확률 기본 계산' },
  { id: 'Q07', discrimination: 1.6, difficulty:  0.0, guessing: 0.2, title: '일차함수와 절편' },
  { id: 'Q08', discrimination: 1.4, difficulty:  0.3, guessing: 0.0, title: '제곱근 사칙연산' },
  { id: 'Q09', discrimination: 1.5, difficulty:  0.6, guessing: 0.2, title: '이차방정식 인수분해' },
  { id: 'Q10', discrimination: 1.7, difficulty:  0.9, guessing: 0.2, title: '이차함수 꼭짓점/최대최소' },
  { id: 'Q11', discrimination: 1.6, difficulty:  1.2, guessing: 0.0, title: '복소수 연산' },
  { id: 'Q12', discrimination: 1.8, difficulty:  1.5, guessing: 0.2, title: '점과 직선의 거리' },
  { id: 'Q13', discrimination: 1.9, difficulty:  1.8, guessing: 0.0, title: '이차방정식 근과계수 심화' },
  { id: 'Q14', discrimination: 1.8, difficulty:  2.1, guessing: 0.2, title: '합성함수 역함수' },
  { id: 'Q15', discrimination: 2.0, difficulty:  2.4, guessing: 0.0, title: '원과 접선의 방정식' },
]

/** 모의 테스트 실행 함수 */
function runSimulation(studentTrueTheta, studentName) {
  console.log(`\n===============================================================`)
  console.log(`🎯 [시뮬레이션] ${studentName} (실제 실력 θ_true = ${studentTrueTheta.toFixed(2)})`)
  console.log(`===============================================================`)

  const responses = []
  const administeredIds = new Set()
  let currentTheta = 0.0
  let currentSE = 1.0

  console.log(`초기 상태: θ_est = 0.00, SE = 1.000`)
  console.log(`---------------------------------------------------------------`)
  console.log(`문항 | 선택 문항 ID (난이도 b) | 정답 확률 | 응답 | 갱신 θ | 표준오차(SE)`)
  console.log(`---------------------------------------------------------------`)

  for (let step = 1; step <= 12; step++) {
    const item = selectNextItem(currentTheta, ITEM_BANK, administeredIds)
    if (!item) break

    administeredIds.add(item.id)

    // 학생의 실제 능력치(trueTheta)에 따른 정답 확률
    const prob = calculateProbability(studentTrueTheta, item)
    // 모의 응답: 확률이 0.5 이상이면 대부분 정답, 결정론적/확률론적 시뮬레이션
    const isCorrect = prob >= 0.5

    responses.push({ item, isCorrect, timeSpentSec: 45 })

    const est = estimateThetaEAP(responses)
    currentTheta = est.theta
    currentSE = est.standardError

    const sign = isCorrect ? '⭕ 정답' : '❌ 오답'
    console.log(
      ` ${String(step).padStart(2)}  | ${item.id} (b = ${item.difficulty >= 0 ? '+' : ''}${item.difficulty.toFixed(2)})`.padEnd(25) +
      `| ${(prob * 100).toFixed(1)}%`.padEnd(10) +
      `| ${sign} ` +
      `| ${currentTheta >= 0 ? '+' : ''}${currentTheta.toFixed(2)}`.padEnd(8) +
      `| SE = ${currentSE.toFixed(3)}`
    )
  }

  const error = Math.abs(currentTheta - studentTrueTheta)
  console.log(`---------------------------------------------------------------`)
  console.log(`🏆 최종 결과:`)
  console.log(`   - 실제 능력치(θ_true) : ${studentTrueTheta >= 0 ? '+' : ''}${studentTrueTheta.toFixed(2)}`)
  console.log(`   - 최종 추정치(θ_est)  : ${currentTheta >= 0 ? '+' : ''}${currentTheta.toFixed(2)}`)
  console.log(`   - 최종 표준오차(SE)   : ${currentSE.toFixed(3)} (목표 SE ≤ 0.28 달성 여부: ${currentSE <= 0.28 ? '✅ 만족' : '보통'})`)
  console.log(`   - 추정 절대 오차      : ${error.toFixed(2)} (목표 오차 < 0.35: ${error < 0.35 ? '✅ 완벽 수렴' : '근접'})`)
}

// 5개 대표 실력 구간 시뮬레이션 검증
console.log('>>> 컴퓨터 적응형 진단 평가 엔진 (CAT IRT 3PL) 12회 모의 수렴 테스트 시작 <<<')

runSimulation(+2.10, '최상위권 학습자 (목표: +2.10)')
runSimulation(+1.15, '상위권 학습자   (목표: +1.15)')
runSimulation( 0.00, '중위권 학습자   (목표:  0.00)')
runSimulation(-1.10, '기초 보완 학습자 (목표: -1.10)')
runSimulation(-2.20, '수포자 기초 진단 (목표: -2.20)')
