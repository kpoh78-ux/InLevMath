/**
 * CAT Engine 30-Item Dense Pool Convergence Verification
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

// 30개 고변별도(a=1.4~2.2) 촘촘한 문항 은행
const DENSE_POOL = []
for (let i = 0; i < 30; i++) {
  const diff = -2.5 + (5.0 / 29) * i
  DENSE_POOL.push({
    id: `ITEM_${String(i+1).padStart(2, '0')}`,
    discrimination: 1.5 + (i % 5) * 0.15,
    difficulty: Number(diff.toFixed(2)),
    guessing: i % 2 === 0 ? 0.2 : 0.0,
  })
}

console.log('-------------------------------------------------------------------------')
console.log('  True θ   | 8문항 θ (SE)    | 10문항 θ (SE)   | 12문항 θ (SE)   | 최종 오차 | SE ≤ 0.28 달성')
console.log('-------------------------------------------------------------------------')

const testThetas = [-2.4, -1.8, -1.2, -0.6, 0.0, 0.6, 1.2, 1.8, 2.4]

for (const trueTheta of testThetas) {
  const responses = []
  const administeredIds = new Set()
  let theta = 0.0
  let se = 1.0
  let se8 = 0, se10 = 0, se12 = 0
  let th8 = 0, th10 = 0, th12 = 0

  for (let step = 1; step <= 12; step++) {
    const item = selectNextItem(theta, DENSE_POOL, administeredIds)
    if (!item) break
    administeredIds.add(item.id)

    const prob = calculateProbability(trueTheta, item)
    const isCorrect = prob >= 0.5
    responses.push({ item, isCorrect, timeSpentSec: 40 })

    const est = estimateThetaEAP(responses)
    theta = est.theta
    se = est.standardError

    if (step === 8) { th8 = theta; se8 = se }
    if (step === 10) { th10 = theta; se10 = se }
    if (step === 12) { th12 = theta; se12 = se }
  }

  const err = Math.abs(theta - trueTheta)
  const sign = trueTheta >= 0 ? '+' : ''
  console.log(
    `  ${sign}${trueTheta.toFixed(1)}    | ` +
    `${th8 >= 0 ? '+' : ''}${th8.toFixed(2)} (${se8.toFixed(3)})  | ` +
    `${th10 >= 0 ? '+' : ''}${th10.toFixed(2)} (${se10.toFixed(3)}) | ` +
    `${th12 >= 0 ? '+' : ''}${th12.toFixed(2)} (${se12.toFixed(3)}) | ` +
    `  ${err.toFixed(2)}     | ${se <= 0.28 ? '✅ 만족' : (se <= 0.33 ? '🟡 근접' : '❌')}`
  )
}
console.log('-------------------------------------------------------------------------')
