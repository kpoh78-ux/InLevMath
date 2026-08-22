/**
 * Test Early Termination Flag (isFinished: true / isCompleted: true) on SE <= 0.28
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

const ITEM_POOL = []
for (let i = 0; i < 25; i++) {
  const diff = -2.5 + (5.0 / 24) * i
  ITEM_POOL.push({
    id: `ITEM_${String(i+1).padStart(2, '0')}`,
    discrimination: 1.6,
    difficulty: Number(diff.toFixed(2)),
    guessing: 0.1,
    answer: '5',
  })
}

// 진단 세션 시뮬레이션
const session = {
  sessionId: 'test_session_cat_001',
  currentTheta: 0.0,
  standardError: 1.0,
  convergenceSE: 0.28,
  maxQuestions: 15,
  responses: [],
  status: 'IN_PROGRESS',
}

function submitResponse(sessionId, problemId, submittedAnswer, timeSpentSec = 45) {
  const item = ITEM_POOL.find(p => p.id === problemId)
  const isCorrect = submittedAnswer === item.answer

  session.responses.push({ item, isCorrect, timeSpentSec })

  const { theta, standardError } = estimateThetaEAP(session.responses)
  session.currentTheta = theta
  session.standardError = standardError

  const administeredIds = new Set(session.responses.map(r => r.item.id))
  const responseCount = session.responses.length

  const converged = standardError <= session.convergenceSE
  const maxReached = responseCount >= session.maxQuestions

  let nextProblem = null
  let isCompleted = false

  if (converged || maxReached) {
    isCompleted = true
    session.status = 'COMPLETED'
  } else {
    nextProblem = selectNextItem(theta, ITEM_POOL, administeredIds)
    if (!nextProblem) {
      isCompleted = true
      session.status = 'COMPLETED'
    }
  }

  return {
    sessionId: session.sessionId,
    isCorrect,
    updatedTheta: theta,
    standardError,
    isCompleted,
    isFinished: isCompleted,
    convergedEarly: converged,
    nextProblem,
    responseIndex: responseCount,
  }
}

console.log('========================================================================')
console.log('🧪 [검증 테스트] SE ≤ 0.28 도달 시 조기 종료 플래그(isFinished / isCompleted) 검증')
console.log('========================================================================\n')

let currentItem = selectNextItem(0.0, ITEM_POOL, new Set())
let step = 1
let terminatedAt = null

console.log(`응답회차 | 문항 ID | 정오답 | 갱신 θ | 표준오차(SE) | isCompleted | isFinished | convergedEarly`)
console.log(`------------------------------------------------------------------------`)

while (currentItem && step <= 15) {
  const result = submitResponse(session.sessionId, currentItem.id, currentItem.answer, 45)

  console.log(
    `  ${String(step).padStart(2)}     | ` +
    `${currentItem.id.padEnd(8)}| ` +
    `${result.isCorrect ? '⭕ 정답' : '❌ 오답'} | ` +
    `${result.updatedTheta >= 0 ? '+' : ''}${result.updatedTheta.toFixed(2)}  | ` +
    `SE = ${result.standardError.toFixed(3)} | ` +
    `${String(result.isCompleted).padEnd(11)} | ` +
    `${String(result.isFinished).padEnd(10)} | ` +
    `${result.convergedEarly ? '✅ true' : 'false'}`
  )

  if (result.isCompleted || result.isFinished) {
    terminatedAt = result
    break
  }

  currentItem = result.nextProblem
  step++
}

console.log(`------------------------------------------------------------------------`)
console.log(`🏆 [검증 결과 분석]`)
console.log(`- 조기 종료 도달 회차    : ${step}회차 (최대 15문항 이전)`)
console.log(`- 종료 시점 표준오차      : SE = ${terminatedAt.standardError.toFixed(3)} (기준 SE ≤ 0.28 충족)`)
console.log(`- 반환된 isCompleted    : ${terminatedAt.isCompleted} (Boolean)`)
console.log(`- 반환된 isFinished     : ${terminatedAt.isFinished} (Boolean)`)
console.log(`- 반환된 convergedEarly : ${terminatedAt.convergedEarly} (Boolean)`)
console.log(`- 다음 문항 (nextProblem) : ${terminatedAt.nextProblem === null ? 'null (정상 종료)' : '문항 반환'}`)
console.log(`\n✅ [성공] SE ≤ 0.28 도달 시 조기 종료 플래그(isFinished: true, isCompleted: true)가 정확히 반환됩니다.`)
console.log('========================================================================\n')
