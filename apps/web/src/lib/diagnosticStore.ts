import {
  ItemParams,
  UserResponse,
  DIAGNOSTIC_ITEM_BANK,
  estimateThetaEAP,
  selectNextItem,
} from './irt'

export interface DiagnosticSession {
  sessionId: string
  studentId: string
  studentName: string
  targetGrade: string
  currentTheta: number
  standardError: number
  responses: UserResponse[]
  status: 'IN_PROGRESS' | 'COMPLETED' | 'ABORTED'
  maxQuestions: number
  convergenceSE: number
  startedAt: string
  completedAt?: string
}

// 인메모리 세션 스토어 (서버 라이프타임 유지)
const globalSessions = new Map<string, DiagnosticSession>()

/** 표준 정규분포 누적분포함수 CDF(x) 근사 (백분위 산출) */
function standardNormalCDF(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x))
  const d = 0.3989423 * Math.exp((-x * x) / 2)
  let prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))))
  if (x > 0) prob = 1 - prob
  return prob
}

/** 능력치 theta 기반 레벨 및 칭호 매핑 */
export function getLevelFromTheta(theta: number): {
  level: number
  grade: number
  title: string
  percentileTop: number
} {
  const cdf = standardNormalCDF(theta)
  // 상위 백분율 (100% - cdf*100%)
  const topPercentile = Math.max(0.1, Math.min(99.9, Number(((1 - cdf) * 100).toFixed(1))))

  if (theta >= 2.2) return { level: 9, grade: 1, title: '프라임 마스터', percentileTop: topPercentile }
  if (theta >= 1.6) return { level: 8, grade: 2, title: '그랜드 마스터', percentileTop: topPercentile }
  if (theta >= 1.0) return { level: 7, grade: 3, title: '마스터', percentileTop: topPercentile }
  if (theta >= 0.5) return { level: 6, grade: 4, title: '엘리트', percentileTop: topPercentile }
  if (theta >= 0.0) return { level: 5, grade: 5, title: '어드밴스', percentileTop: topPercentile }
  if (theta >= -0.6) return { level: 4, grade: 6, title: '스텐다드', percentileTop: topPercentile }
  if (theta >= -1.2) return { level: 3, grade: 7, title: '트레이니', percentileTop: topPercentile }
  if (theta >= -1.8) return { level: 2, grade: 8, title: '루키', percentileTop: topPercentile }
  return { level: 1, grade: 9, title: '비긴너', percentileTop: topPercentile }
}

/** 5각 역량 점수 계산 (0 ~ 100점 척도) */
export function calculateRadarCapabilities(
  theta: number,
  responses: UserResponse[]
): {
  calculation: number      // 계산력
  comprehension: number    // 이해력
  reasoning: number        // 추론력
  problemSolving: number   // 문제해결력
  application: number      // 응용력
} {
  // theta (-3 ~ +3) -> 기본 점수 (15 ~ 95)
  const base = Math.max(10, Math.min(98, Math.round(((theta + 3.0) / 6.0) * 85 + 10)))

  let correctCount = 0
  let shortAnswerCorrect = 0
  let shortAnswerTotal = 0
  let highDiffCorrect = 0
  let highDiffTotal = 0

  for (const r of responses) {
    if (r.isCorrect) correctCount++
    if (r.item.problemType === 'SHORT_ANSWER') {
      shortAnswerTotal++
      if (r.isCorrect) shortAnswerCorrect++
    }
    if (r.item.difficulty >= 0.5) {
      highDiffTotal++
      if (r.isCorrect) highDiffCorrect++
    }
  }

  const accuracyRate = responses.length > 0 ? correctCount / responses.length : 0.5
  const shortRate = shortAnswerTotal > 0 ? shortAnswerCorrect / shortAnswerTotal : accuracyRate
  const highDiffRate = highDiffTotal > 0 ? highDiffCorrect / highDiffTotal : accuracyRate

  const calculation = Math.max(10, Math.min(99, Math.round(base * 0.7 + shortRate * 30)))
  const comprehension = Math.max(10, Math.min(99, Math.round(base * 0.75 + accuracyRate * 25)))
  const reasoning = Math.max(10, Math.min(99, Math.round(base * 0.7 + highDiffRate * 30)))
  const problemSolving = Math.max(10, Math.min(99, Math.round(base * 0.65 + highDiffRate * 20 + shortRate * 15)))
  const application = Math.max(10, Math.min(99, Math.round(base * 0.7 + accuracyRate * 15 + highDiffRate * 15)))

  return { calculation, comprehension, reasoning, problemSolving, application }
}

/** 진단 세션 생성 */
export function createDiagnosticSession(params: {
  studentId?: string
  studentName?: string
  targetGrade?: string
  maxQuestions?: number
}): { session: DiagnosticSession; firstItem: ItemParams } {
  const sessionId = `diag_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
  const studentId = params.studentId || 'guest_student'
  const studentName = params.studentName || '학습자'
  const targetGrade = params.targetGrade || '중2'
  const maxQuestions = params.maxQuestions || 15

  const firstItem = selectNextItem(0.0, DIAGNOSTIC_ITEM_BANK, new Set())!

  const session: DiagnosticSession = {
    sessionId,
    studentId,
    studentName,
    targetGrade,
    currentTheta: 0.0,
    standardError: 1.0,
    responses: [],
    status: 'IN_PROGRESS',
    maxQuestions,
    convergenceSE: 0.28,
    startedAt: new Date().toISOString(),
  }

  globalSessions.set(sessionId, session)
  return { session, firstItem }
}

/** 진단 세션 조회 */
export function getDiagnosticSession(sessionId: string): DiagnosticSession | null {
  return globalSessions.get(sessionId) || null
}

/** 진단 응답 제출 및 세션 갱신 */
export function submitDiagnosticResponse(
  sessionId: string,
  problemId: string,
  submittedAnswer: string,
  timeSpentSec = 60
): {
  session: DiagnosticSession
  isCorrect: boolean
  updatedTheta: number
  standardError: number
  isCompleted: boolean
  nextProblem: ItemParams | null
  responseIndex: number
} {
  const session = globalSessions.get(sessionId)
  if (!session) {
    throw new Error('진단 세션을 찾을 수 없습니다.')
  }
  if (session.status === 'COMPLETED') {
    throw new Error('이미 완료된 진단 세션입니다.')
  }

  const item = DIAGNOSTIC_ITEM_BANK.find((p) => p.id === problemId)
  if (!item) {
    throw new Error('문항 정보를 찾을 수 없습니다.')
  }

  // 답안 정답 여부 판정 (공백 및 형식 정규화)
  const normSub = submittedAnswer.replace(/\s+/g, '').toLowerCase()
  const normAns = item.answer.replace(/\s+/g, '').toLowerCase()
  const isCorrect = normSub === normAns || submittedAnswer.trim() === item.answer.trim()

  const responseRecord: UserResponse = {
    item,
    isCorrect,
    timeSpentSec: Math.max(1, timeSpentSec),
    submittedAnswer,
  }

  session.responses.push(responseRecord)

  // IRT EAP 수치 적분 추정 (61구간 적분)
  const { theta, standardError } = estimateThetaEAP(session.responses)
  session.currentTheta = theta
  session.standardError = standardError

  const administeredIds = new Set(session.responses.map((r) => r.item.id))
  const responseCount = session.responses.length

  // 수렴 조건: SE <= 0.28 (조기 수렴) 또는 최대 문항 수 도달
  const converged = standardError <= session.convergenceSE
  const maxReached = responseCount >= session.maxQuestions

  let nextProblem: ItemParams | null = null
  let isCompleted = false

  if (converged || maxReached) {
    isCompleted = true
    session.status = 'COMPLETED'
    session.completedAt = new Date().toISOString()
  } else {
    nextProblem = selectNextItem(theta, DIAGNOSTIC_ITEM_BANK, administeredIds)
    if (!nextProblem) {
      isCompleted = true
      session.status = 'COMPLETED'
      session.completedAt = new Date().toISOString()
    }
  }

  globalSessions.set(sessionId, session)

  return {
    session,
    isCorrect,
    updatedTheta: theta,
    standardError,
    isCompleted,
    isFinished: isCompleted,
    nextProblem,
    responseIndex: responseCount,
    convergedEarly: converged,
  }
}

/** 최종 5각 방사형 진단 분석 리포트 생성 */
export function generateDiagnosticReport(session: DiagnosticSession) {
  const { currentTheta, standardError, responses, targetGrade } = session
  const levelInfo = getLevelFromTheta(currentTheta)
  const capabilities = calculateRadarCapabilities(currentTheta, responses)

  // 도메인별 성취도 집계
  const domainMap: Record<string, { total: number; correct: number; items: string[] }> = {}
  for (const r of responses) {
    const domain = r.item.domain || '기타'
    if (!domainMap[domain]) {
      domainMap[domain] = { total: 0, correct: 0, items: [] }
    }
    domainMap[domain].total++
    if (r.isCorrect) domainMap[domain].correct++
    domainMap[domain].items.push(r.item.conceptTitle || r.item.id)
  }

  const domainScores = Object.entries(domainMap).map(([domain, data]) => ({
    domain,
    total: data.total,
    correct: data.correct,
    rate: data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0,
  }))

  // 취약 개념 분석 및 결손 노드 역추적 처방
  const wrongResponses = responses.filter((r) => !r.isCorrect)
  const weakConcepts = wrongResponses.map((r) => ({
    conceptId: r.item.conceptId,
    conceptTitle: r.item.conceptTitle,
    difficulty: r.item.difficulty,
    domain: r.item.domain,
    userAnswer: r.submittedAnswer,
    correctAnswer: r.item.answer,
    solutionLatex: r.item.solutionLatex,
  }))

  // 처방 가이드 메시지
  let prescriptionSummary = ''
  if (levelInfo.level >= 8) {
    prescriptionSummary = '최상위권 수학적 추론력 및 고난도 문제해결력을 보유하고 있습니다. 수능 킬러 및 심화 서술형 고득점 대비를 권장합니다.'
  } else if (levelInfo.level >= 6) {
    prescriptionSummary = '탄탄한 기본 개념과 안정적인 계산력을 보유하고 있습니다. 응용/심화 단계 문제 해결 속도 향상을 위한 변형 문항 훈련을 권장합니다.'
  } else if (levelInfo.level >= 4) {
    prescriptionSummary = '중위권 표준 개념을 형성하고 있으나, 복합 개념 결합 문항에서 취약점이 발견되었습니다. 오답 노드 선수 개념 집중 보완을 권장합니다.'
  } else {
    prescriptionSummary = '기초 연산 및 기본 개념 노드의 결손이 확인되었습니다. 1:1 맞춤형 기초 개념 클리닉 및 단계별 드릴 학습이 필수적입니다.'
  }

  return {
    sessionId: session.sessionId,
    studentId: session.studentId,
    studentName: session.studentName,
    targetGrade,
    startedAt: session.startedAt,
    completedAt: session.completedAt || new Date().toISOString(),
    status: session.status,
    totalQuestions: responses.length,
    correctCount: responses.filter((r) => r.isCorrect).length,
    overallCorrectRate: responses.length > 0
      ? Math.round((responses.filter((r) => r.isCorrect).length / responses.length) * 100)
      : 0,
    irt: {
      theta: currentTheta,
      standardError,
      confidence: standardError <= 0.28 ? '99% 신뢰구간 정밀 수렴' : '표준 추정',
      level: levelInfo.level,
      grade: levelInfo.grade,
      title: levelInfo.title,
      percentileTop: levelInfo.percentileTop,
    },
    capabilities,
    domainScores,
    weakConcepts,
    prescription: {
      summary: prescriptionSummary,
      recommendedLevel: `Lv.${levelInfo.level} (${levelInfo.title})`,
      recommendedMission: levelInfo.level >= 6 ? 'advanced_problem' : 'concept_problem',
      recommendedReviewTopics: weakConcepts.map((w) => w.conceptTitle).filter(Boolean),
    },
    administeredProblems: responses.map((r, idx) => ({
      index: idx + 1,
      id: r.item.id,
      conceptTitle: r.item.conceptTitle,
      domain: r.item.domain,
      difficulty: r.item.difficulty,
      discrimination: r.item.discrimination,
      isCorrect: r.isCorrect,
      timeSpentSec: r.timeSpentSec,
      submittedAnswer: r.submittedAnswer,
      correctAnswer: r.item.answer,
    })),
  }
}
