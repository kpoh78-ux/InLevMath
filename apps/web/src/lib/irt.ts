/**
 * apps/web/src/lib/irt.ts
 * IRT 3PL Parameter Model & EAP (Expected A Posteriori) Estimation
 */

export interface ItemParams {
  id: string
  discrimination: number // a: 변별도 (0.5 ~ 2.5)
  difficulty: number     // b: 난이도 (-3.0 ~ +3.0)
  guessing: number       // c: 추측도 (0.0 ~ 0.25)
  conceptId?: string
  conceptTitle?: string
  domain?: '수와 연산' | '문자와 식' | '함수' | '기하' | '확률과 통계'
  grade?: string
  contentLatex: string
  problemType: 'MULTIPLE_CHOICE' | 'SHORT_ANSWER'
  optionsJson?: string[]
  answer: string
  solutionLatex?: string
}

export interface UserResponse {
  item: ItemParams
  isCorrect: boolean
  timeSpentSec: number
  submittedAnswer?: string
}

const D = 1.7 // 로지스틱 스케일링 상수

// 1. 3PL 문항 정답 확률 계산 P_i(theta)
export function calculateProbability(theta: number, item: ItemParams): number {
  const { discrimination: a, difficulty: b, guessing: c } = item
  const exponent = -D * a * (theta - b)
  return c + (1 - c) / (1 + Math.exp(exponent))
}

// 2. Fisher 문항 정보량 I_i(theta) 계산 (정보량이 최대인 다음 문항 선택)
export function calculateFisherInformation(theta: number, item: ItemParams): number {
  const p = calculateProbability(theta, item)
  const { discrimination: a, guessing: c, difficulty: b } = item
  const pStar = 1 / (1 + Math.exp(-D * a * (theta - b)))

  if (p <= 0 || p >= 1) return 0
  return (Math.pow(D * a, 2) * Math.pow(pStar, 2) * (1 - pStar) * (1 - c)) / p
}

// 3. EAP 수치 적분을 통한 theta 및 표준오차(SE) 추정 (61구간 적분)
export function estimateThetaEAP(
  responses: UserResponse[],
  quadPoints = 61,
  minTheta = -3.0,
  maxTheta = 3.0
): { theta: number; standardError: number } {
  if (responses.length === 0) {
    return { theta: 0.0, standardError: 1.0 }
  }

  const step = (maxTheta - minTheta) / (quadPoints - 1)
  let numerator = 0
  let denominator = 0
  const nodes: { x: number; weight: number }[] = []

  for (let i = 0; i < quadPoints; i++) {
    const x = minTheta + i * step
    // 표준정규분포 N(0, 1) 사전 확률 density
    const prior = (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * x * x)

    // 우도 (Likelihood) 계산
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

  // 사후 분산 및 표준오차 계산
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

// 4. 다음 최적 문항 선정 (Fisher Information Maximize)
export function selectNextItem(
  currentTheta: number,
  candidatePool: ItemParams[],
  administeredItemIds: Set<string>
): ItemParams | null {
  const availableItems = candidatePool.filter((item) => !administeredItemIds.has(item.id))
  if (availableItems.length === 0) return null

  let bestItem: ItemParams = availableItems[0]
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

// ─── IRT 3PL 진단 평가 표준 문항 은행 (Item Bank) ────────────────────────────
export const DIAGNOSTIC_ITEM_BANK: ItemParams[] = [
  // ── 난이도 매우 낮음 (b: -2.5 ~ -1.5) ──────────────────────────────────────
  {
    id: 'MATH-CAT-001',
    discrimination: 1.1,
    difficulty: -2.4,
    guessing: 0.2,
    conceptId: 'MATH-MID1-NUM-001',
    conceptTitle: '정수와 유리수의 덧셈과 뺄셈',
    domain: '수와 연산',
    grade: '중1',
    contentLatex: '다음 식을 계산한 값은?\n\n$$(-5) + (+8) - (-3)$$',
    problemType: 'MULTIPLE_CHOICE',
    optionsJson: ['0', '3', '6', '10', '16'],
    answer: '6',
    solutionLatex: '$$(-5) + 8 - (-3) = -5 + 8 + 3 = 3 + 3 = 6$$이므로 정답은 6입니다.',
  },
  {
    id: 'MATH-CAT-002',
    discrimination: 1.25,
    difficulty: -1.8,
    guessing: 0.0,
    conceptId: 'MATH-MID1-ALG-002',
    conceptTitle: '일차방정식의 기본 풀이',
    domain: '문자와 식',
    grade: '중1',
    contentLatex: '일차방정식 $$3x - 4 = 11$$의 해 $x$의 값을 구하시오.',
    problemType: 'SHORT_ANSWER',
    answer: '5',
    solutionLatex: '$$3x = 11 + 4 \\implies 3x = 15 \\implies x = 5$$',
  },
  {
    id: 'MATH-CAT-003',
    discrimination: 1.3,
    difficulty: -1.5,
    guessing: 0.2,
    conceptId: 'MATH-MID1-GEO-001',
    conceptTitle: '기본 도형의 각의 성질',
    domain: '기하',
    grade: '중1',
    contentLatex: '삼각형의 세 내각의 크기의 비가 $2 : 3 : 4$일 때, 가장 큰 내각의 크기는?',
    problemType: 'MULTIPLE_CHOICE',
    optionsJson: ['40^\\circ', '60^\\circ', '80^\\circ', '90^\\circ', '100^\\circ'],
    answer: '80^\\circ',
    solutionLatex: '세 내각의 합은 $180^\\circ$이므로 가장 큰 각은 $180^\\circ \\times \\frac{4}{2+3+4} = 180^\\circ \\times \\frac{4}{9} = 80^\\circ$입니다.',
  },

  // ── 난이도 낮음 (b: -1.2 ~ -0.4) ──────────────────────────────────────────
  {
    id: 'MATH-CAT-004',
    discrimination: 1.35,
    difficulty: -1.0,
    guessing: 0.2,
    conceptId: 'MATH-MID2-NUM-002',
    conceptTitle: '순환소수를 분수로 나타내기',
    domain: '수와 연산',
    grade: '중2',
    contentLatex: '순환소수 $0.\\dot{4}\\dot{5}$를 기약분수로 나타내면?',
    problemType: 'MULTIPLE_CHOICE',
    optionsJson: ['\\frac{45}{100}', '\\frac{5}{11}', '\\frac{9}{20}', '\\frac{15}{33}', '\\frac{4}{9}'],
    answer: '\\frac{5}{11}',
    solutionLatex: '$$0.\\dot{4}\\dot{5} = \\frac{45}{99} = \\frac{5}{11}$$',
  },
  {
    id: 'MATH-CAT-005',
    discrimination: 1.4,
    difficulty: -0.6,
    guessing: 0.0,
    conceptId: 'MATH-MID2-ALG-003',
    conceptTitle: '연립일차방정식의 풀이 (가감법)',
    domain: '문자와 식',
    grade: '중2',
    contentLatex: '연립방정식 $\\begin{cases} 2x + y = 7 \\\\ x - y = 2 \\end{cases}$ 의 해를 $(x, y)$라 할 때, $x + 2y$의 값을 구하시오.',
    problemType: 'SHORT_ANSWER',
    answer: '5',
    solutionLatex: '두 식을 더하면 $3x = 9 \\implies x = 3$. $y = x - 2 = 1$. 따라서 $x + 2y = 3 + 2(1) = 5$.',
  },
  {
    id: 'MATH-CAT-006',
    discrimination: 1.2,
    difficulty: -0.4,
    guessing: 0.2,
    conceptId: 'MATH-MID2-STA-001',
    conceptTitle: '경우의 수와 확률의 기본 성질',
    domain: '확률과 통계',
    grade: '중2',
    contentLatex: '주사위 한 개를 던질 때, $3$의 배수 또는 $5$의 눈이 나올 확률은?',
    problemType: 'MULTIPLE_CHOICE',
    optionsJson: ['\\frac{1}{6}', '\\frac{1}{3}', '\\frac{1}{2}', '\\frac{2}{3}', '\\frac{5}{6}'],
    answer: '\\frac{1}{2}',
    solutionLatex: '$3$의 배수는 $\\{3, 6\\}$ (2개), $5$의 눈은 $\\{5\\}$ (1개). 총 $3$가지이므로 확률은 $\\frac{3}{6} = \\frac{1}{2}$입니다.',
  },

  // ── 난이도 보통 (기준점 b: -0.2 ~ +0.4) ────────────────────────────────────
  {
    id: 'MATH-CAT-007',
    discrimination: 1.5,
    difficulty: 0.0,
    guessing: 0.2,
    conceptId: 'MATH-MID2-FUNC-001',
    conceptTitle: '일차함수 기울기와 절편',
    domain: '함수',
    grade: '중2',
    contentLatex: '일차함수 $y = -2x + 6$의 그래프가 $x$축과 만나는 점의 좌표를 $(p, 0)$, $y$축과 만나는 점의 좌표를 $(0, q)$라 할 때, $p + q$의 값은?',
    problemType: 'MULTIPLE_CHOICE',
    optionsJson: ['5', '7', '9', '11', '13'],
    answer: '9',
    solutionLatex: '$y=0$일 때 $-2x+6=0 \\implies x=3$이므로 $p=3$. $x=0$일 때 $y=6$이므로 $q=6$. $p+q = 3+6=9$.',
  },
  {
    id: 'MATH-CAT-008',
    discrimination: 1.6,
    difficulty: 0.15,
    guessing: 0.0,
    conceptId: 'MATH-MID3-NUM-001',
    conceptTitle: '제곱근의 성질과 사칙계산',
    domain: '수와 연산',
    grade: '중3',
    contentLatex: '$\\sqrt{75} - 2\\sqrt{12} + \\sqrt{27}$ 을 간단히 한 결과가 $k\\sqrt{3}$일 때, 정수 $k$의 값을 구하시오.',
    problemType: 'SHORT_ANSWER',
    answer: '4',
    solutionLatex: '$$\\sqrt{75} = 5\\sqrt{3}, \\quad 2\\sqrt{12} = 4\\sqrt{3}, \\quad \\sqrt{27} = 3\\sqrt{3}$$\n$$5\\sqrt{3} - 4\\sqrt{3} + 3\\sqrt{3} = 4\\sqrt{3} \\implies k = 4$$',
  },
  {
    id: 'MATH-CAT-009',
    discrimination: 1.45,
    difficulty: 0.35,
    guessing: 0.2,
    conceptId: 'MATH-MID3-ALG-002',
    conceptTitle: '인수분해 공식을 이용한 이차방정식 풀이',
    domain: '문자와 식',
    grade: '중3',
    contentLatex: '이차방정식 $x^2 - 7x + 12 = 0$의 두 근을 $\\alpha, \\beta$ ($\\,\\alpha < \\beta\\,$)라 할 때, $2\\alpha + \\beta$의 값은?',
    problemType: 'MULTIPLE_CHOICE',
    optionsJson: ['9', '10', '11', '12', '13'],
    answer: '10',
    solutionLatex: '$$(x-3)(x-4) = 0 \\implies x=3 \\text{ 또는 } x=4$$\n$\\alpha=3, \\beta=4$이므로 $2\\alpha + \\beta = 2(3) + 4 = 10$.',
  },

  // ── 난이도 중상 (b: +0.6 ~ +1.4) ──────────────────────────────────────────
  {
    id: 'MATH-CAT-010',
    discrimination: 1.55,
    difficulty: 0.75,
    guessing: 0.2,
    conceptId: 'MATH-MID3-FUNC-002',
    conceptTitle: '이차함수의 최댓값과 최솟값',
    domain: '함수',
    grade: '중3',
    contentLatex: '이차함수 $y = -(x-2)^2 + 8$의 최댓값을 $M$, 축의 방정식을 $x=p$라 할 때, $M \\times p$의 값은?',
    problemType: 'MULTIPLE_CHOICE',
    optionsJson: ['8', '12', '16', '18', '20'],
    answer: '16',
    solutionLatex: '꼭짓점 $(2, 8)$에서 위로 볼록하므로 최댓값 $M=8$, 축의 방정식 $x=2$이므로 $p=2$. $M \\times p = 8 \\times 2 = 16$.',
  },
  {
    id: 'MATH-CAT-011',
    discrimination: 1.65,
    difficulty: 1.0,
    guessing: 0.0,
    conceptId: 'MATH-HIGH-ALG-001',
    conceptTitle: '복소수의 연산과 켤레복소수',
    domain: '문자와 식',
    grade: '고1',
    contentLatex: '복소수 $z = 3 + 2i$에 대하여 $z\\bar{z}$의 값을 구하시오. (단, $i = \\sqrt{-1}$이고 $\\bar{z}$는 $z$의 켤레복소수이다.)',
    problemType: 'SHORT_ANSWER',
    answer: '13',
    solutionLatex: '$$z\\bar{z} = (3+2i)(3-2i) = 3^2 - (2i)^2 = 9 - (-4) = 13$$',
  },
  {
    id: 'MATH-CAT-012',
    discrimination: 1.7,
    difficulty: 1.3,
    guessing: 0.2,
    conceptId: 'MATH-HIGH-GEO-002',
    conceptTitle: '점과 직선 사이의 거리 공식',
    domain: '기하',
    grade: '고1',
    contentLatex: '점 $(2, -1)$과 직선 $3x - 4y + 5 = 0$ 사이의 거리는?',
    problemType: 'MULTIPLE_CHOICE',
    optionsJson: ['1', '2', '3', '4', '5'],
    answer: '3',
    solutionLatex: '$$d = \\frac{|3(2) - 4(-1) + 5|}{\\sqrt{3^2 + (-4)^2}} = \\frac{|6 + 4 + 5|}{\\sqrt{25}} = \\frac{15}{5} = 3$$',
  },

  // ── 난이도 심화/최상위 (b: +1.6 ~ +2.5) ────────────────────────────────────
  {
    id: 'MATH-CAT-013',
    discrimination: 1.8,
    difficulty: 1.75,
    guessing: 0.0,
    conceptId: 'MATH-HIGH-ALG-004',
    conceptTitle: '이차방정식 근과 계수의 관계 및 판별식 응용',
    domain: '문자와 식',
    grade: '고1',
    contentLatex: '이차방정식 $x^2 - 4x + k = 0$의 두 실근 $\\alpha, \\beta$에 대하여 $\\alpha^2 + \\beta^2 = 10$일 때, 상수 $k$의 값을 구하시오.',
    problemType: 'SHORT_ANSWER',
    answer: '3',
    solutionLatex: '근과 계수의 관계에 의해 $\\alpha + \\beta = 4$, $\\alpha\\beta = k$.\n$$\\alpha^2 + \\beta^2 = (\\alpha+\\beta)^2 - 2\\alpha\\beta = 4^2 - 2k = 16 - 2k = 10 \\implies 2k = 6 \\implies k = 3$$',
  },
  {
    id: 'MATH-CAT-014',
    discrimination: 1.9,
    difficulty: 2.1,
    guessing: 0.2,
    conceptId: 'MATH-HIGH-FUNC-005',
    conceptTitle: '합성함수와 역함수의 성질',
    domain: '함수',
    grade: '고1',
    contentLatex: '함수 $f(x) = 2x - 3$과 $g(x) = x^2 + 1$에 대하여 $(g \\circ f)(3)$의 값은?',
    problemType: 'MULTIPLE_CHOICE',
    optionsJson: ['8', '10', '12', '14', '16'],
    answer: '10',
    solutionLatex: '$$f(3) = 2(3) - 3 = 3$$\n$$(g \\circ f)(3) = g(f(3)) = g(3) = 3^2 + 1 = 10$$',
  },
  {
    id: 'MATH-CAT-015',
    discrimination: 1.95,
    difficulty: 2.5,
    guessing: 0.0,
    conceptId: 'MATH-HIGH-GEO-005',
    conceptTitle: '원의 방정식과 접선의 방정식',
    domain: '기하',
    grade: '고1',
    contentLatex: '원 $x^2 + y^2 = 25$ 위의 점 $(3, 4)$에서의 접선의 $y$절편을 구하시오. (단, 기약분수 $a/b$ 형태인 경우 $a/b$ 형태로 입력)',
    problemType: 'SHORT_ANSWER',
    answer: '25/4',
    solutionLatex: '원 위의 점 $(x_1, y_1)$에서의 접선 방정식은 $x_1 x + y_1 y = r^2$.\n$$3x + 4y = 25 \\implies 4y = -3x + 25 \\implies y = -\\frac{3}{4}x + \\frac{25}{4}$$\n따라서 $y$절편은 $\\frac{25}{4}$입니다.',
  },
]
