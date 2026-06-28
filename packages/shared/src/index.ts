// InLevMath 공유 타입 및 상수

// ── 사용자 한도 설정 (나중에 이 값만 변경하면 전체 적용) ──────────────────
export const APP_LIMITS = {
  maxTeachers: 10,   // 선생님 최대 등록 수
  maxStudents: 300,  // 학생 최대 등록 수
} as const

export type AppLimits = typeof APP_LIMITS

// ── 역할 및 인증 ────────────────────────────────────────────────────────────
export type UserRole = 'student' | 'teacher'

export interface BaseUser {
  id: string
  name: string
  email: string
  role: UserRole
  createdAt: string
}

export interface Teacher extends BaseUser {
  role: 'teacher'
}

export interface Student extends BaseUser {
  role: 'student'
  teacherId: string
  currentLevel: number
  currentMission: MissionType
}

// ── 미션 ────────────────────────────────────────────────────────────────────
export type MissionType =
  | 'concept_learning'   // 개념익히기
  | 'concept_problem'    // 개념확인문제
  | 'basic_problem'      // 기본문제
  | 'advanced_problem'   // 발전문제
  | 'top_problem'        // 최상위문제

export const MISSION_ORDER: MissionType[] = [
  'concept_learning',
  'concept_problem',
  'basic_problem',
  'advanced_problem',
  'top_problem',
]

export const MISSION_LABELS: Record<MissionType, string> = {
  concept_learning: '개념익히기',
  concept_problem: '개념확인문제',
  basic_problem: '기본문제',
  advanced_problem: '발전문제',
  top_problem: '최상위문제',
}

export const MISSION_LEVEL: Record<MissionType, number> = {
  concept_learning: 1,
  concept_problem: 2,
  basic_problem: 3,
  advanced_problem: 4,
  top_problem: 5,
}

// ── 능력치 ──────────────────────────────────────────────────────────────────
export interface AbilityScore {
  comprehension: number  // 이해력 (0~100)
  reasoning: number      // 추론력 (0~100)
  calculation: number    // 계산력 (0~100)
}

// 미션별 주요 능력치 가중치
export const MISSION_ABILITY_WEIGHT: Record<MissionType, Partial<AbilityScore>> = {
  concept_learning: { comprehension: 1.0 },
  concept_problem:  { comprehension: 0.6, reasoning: 0.4 },
  basic_problem:    { reasoning: 0.5, calculation: 0.5 },
  advanced_problem: { reasoning: 0.4, calculation: 0.6 },
  top_problem:      { comprehension: 0.33, reasoning: 0.33, calculation: 0.34 },
}

// 미션 클리어 목표 능력치 (0~100 기준)
export const MISSION_CLEAR_THRESHOLD: Record<MissionType, number> = {
  concept_learning: 70,
  concept_problem: 70,
  basic_problem: 75,
  advanced_problem: 80,
  top_problem: 85,
}

// ── 학습 결과 입력 ───────────────────────────────────────────────────────────
export type ResultSource = 'mathflat' | 'manual'  // 매쓰플랫 자동 or 수동 입력

export interface MissionResult {
  id: string
  studentId: string
  missionType: MissionType
  totalProblems: number
  correctProblems: number
  source: ResultSource
  solvedAt: string        // ISO 날짜
  createdAt: string
}

// ── 학생 레벨 현황 ───────────────────────────────────────────────────────────
export interface StudentProgress {
  studentId: string
  currentLevel: number
  currentMission: MissionType
  abilityScore: AbilityScore
  missionCleared: boolean
  recentResults: MissionResult[]
}

// ── 학습지 스텝 시스템 ───────────────────────────────────────────────────────
export type WorksheetCategory = '단원별' | '내신대비'

// 단원별 스텝 (계산력·이해력·추론력 순으로 난이도 상승)
export type UnitStep = '기초' | '기본' | '발전' | '최상위'
// 내신대비 스텝
export type ExamStep = '최다빈출' | '최다오답' | '서술형'
export type WorksheetStep = UnitStep | ExamStep

export const UNIT_STEPS: UnitStep[] = ['기초', '기본', '발전', '최상위']
export const EXAM_STEPS: ExamStep[] = ['최다빈출', '최다오답', '서술형']

// 스텝별 클리어 기준 정답률 (%)
export const STEP_CLEAR_THRESHOLD: Record<WorksheetStep, number> = {
  '기초':    80,
  '기본':    75,
  '발전':    70,
  '최상위':  65,
  '최다빈출': 75,
  '최다오답': 70,
  '서술형':  60,
}

// 스텝별 능력치 가중치 (합산 1.0)
export const STEP_ABILITY_WEIGHT: Record<WorksheetStep, Partial<AbilityScore>> = {
  '기초':    { calculation: 0.7, comprehension: 0.3 },
  '기본':    { calculation: 0.4, comprehension: 0.4, reasoning: 0.2 },
  '발전':    { reasoning: 0.4, comprehension: 0.4, calculation: 0.2 },
  '최상위':  { reasoning: 0.5, comprehension: 0.3, calculation: 0.2 },
  '최다빈출': { comprehension: 0.4, reasoning: 0.4, calculation: 0.2 },
  '최다오답': { comprehension: 0.5, reasoning: 0.3, calculation: 0.2 },
  '서술형':  { reasoning: 0.5, comprehension: 0.4, calculation: 0.1 },
}

// 스텝 레이블 (UI 표시용)
export const STEP_LABEL: Record<WorksheetStep, string> = {
  '기초': '기초', '기본': '기본', '발전': '발전', '최상위': '최상위',
  '최다빈출': '최다빈출', '최다오답': '최다오답', '서술형': '서술형',
}

// 스텝별 배지 색상 (Tailwind 클래스)
export const STEP_COLOR: Record<WorksheetStep, { bg: string; text: string; border: string }> = {
  '기초':    { bg: 'bg-sky-50',    text: 'text-sky-600',    border: 'border-sky-200' },
  '기본':    { bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-200' },
  '발전':    { bg: 'bg-amber-50',  text: 'text-amber-600',  border: 'border-amber-200' },
  '최상위':  { bg: 'bg-rose-50',   text: 'text-rose-600',   border: 'border-rose-200' },
  '최다빈출': { bg: 'bg-violet-50', text: 'text-violet-600', border: 'border-violet-200' },
  '최다오답': { bg: 'bg-orange-50', text: 'text-orange-600', border: 'border-orange-200' },
  '서술형':  { bg: 'bg-pink-50',   text: 'text-pink-600',   border: 'border-pink-200' },
}

// 학습지 배포 상태
export type DistributionStatus = 'distributed' | 'submitted' | 'graded'

export interface WorksheetDistribution {
  id: string
  worksheetId: string
  worksheetTitle: string
  category: WorksheetCategory
  step: WorksheetStep
  studentId: string
  distributedAt: string
  status: DistributionStatus
  totalProblems: number
  correctProblems?: number
  submittedAt?: string
}

// 학습지 결과 기반 능력치 계산
export function calcWorksheetAbilityDelta(
  step: WorksheetStep,
  correctRate: number
): Partial<AbilityScore> {
  const weights = STEP_ABILITY_WEIGHT[step]
  const gain = correctRate * 0.08  // 미션보다 소폭 낮게 (0.1 → 0.08)
  const delta: Partial<AbilityScore> = {}
  if (weights.comprehension) delta.comprehension = gain * weights.comprehension
  if (weights.reasoning)     delta.reasoning     = gain * weights.reasoning
  if (weights.calculation)   delta.calculation   = gain * weights.calculation
  return delta
}

// ── 점수 계산 유틸 ───────────────────────────────────────────────────────────
export function calcCorrectRate(total: number, correct: number): number {
  if (total === 0) return 0
  return Math.round((correct / total) * 100)
}

export function calcAbilityDelta(
  missionType: MissionType,
  correctRate: number
): Partial<AbilityScore> {
  const weights = MISSION_ABILITY_WEIGHT[missionType]
  const delta: Partial<AbilityScore> = {}
  const gain = correctRate * 0.1  // 정답률 기반 소량씩 누적

  if (weights.comprehension) delta.comprehension = gain * weights.comprehension
  if (weights.reasoning)     delta.reasoning     = gain * weights.reasoning
  if (weights.calculation)   delta.calculation   = gain * weights.calculation

  return delta
}
