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

// ── 레벨·칭호 (평균 정답률 기반) ────────────────────────────────────────────
//
// 레벨은 학생이 지금까지 푼 문제의 평균 정답률 하나로 정해진다.
// 채점 기록이 아직 없으면 레벨을 매길 수 없으므로 '수학 입문자'로 시작한다.
//
// 학년·학기·교재 과정이 바뀌면 평균을 완전히 지우지 않고
// 직전 과정 평균을 30%만 남기고 새 과정 채점 결과를 70% 반영한다.
// (COURSE_CARRY_WEIGHT / COURSE_NEW_WEIGHT)

export type LevelTier = {
  level: number      // Lv.1 ~ Lv.9
  grade: number      // 9등급 ~ 1등급 (레벨이 높을수록 등급 숫자는 작다)
  title: string
  minRate: number    // 이 정답률(%) 이상
}

/** 레벨이 높은 것부터 — 정답률로 찾을 때 위에서부터 보면 된다 */
export const LEVEL_TIERS: LevelTier[] = [
  { level: 9, grade: 1, title: '프라임 마스터', minRate: 96 },
  { level: 8, grade: 2, title: '그랜드 마스터', minRate: 92 },
  { level: 7, grade: 3, title: '마스터',       minRate: 88 },
  { level: 6, grade: 4, title: '엘리트',       minRate: 82 },
  { level: 5, grade: 5, title: '어드밴스',     minRate: 76 },
  { level: 4, grade: 6, title: '스텐다드',     minRate: 70 },
  { level: 3, grade: 7, title: '트레이니',     minRate: 60 },
  { level: 2, grade: 8, title: '루키',         minRate: 40 },
  { level: 1, grade: 9, title: '비긴너',       minRate: 0 },
]

/** 채점 기록이 없을 때 쓰는 칭호 */
export const START_TITLE = '수학 입문자'

/** 과정이 바뀔 때 직전 평균을 남기는 비중 */
export const COURSE_CARRY_WEIGHT = 0.3
/** 새 과정 채점 결과를 반영하는 비중 */
export const COURSE_NEW_WEIGHT = 0.7

/** 평균 정답률(%) → 레벨 단계. 기록이 없으면(null) 입문자 단계 */
export function levelTierOf(avgRate: number | null | undefined): LevelTier | null {
  if (avgRate === null || avgRate === undefined || Number.isNaN(avgRate)) return null
  return LEVEL_TIERS.find(t => avgRate >= t.minRate) ?? LEVEL_TIERS[LEVEL_TIERS.length - 1]
}

/** 화면에 쓸 레벨/등급/칭호 한 벌 */
export function levelInfoOf(avgRate: number | null | undefined) {
  const tier = levelTierOf(avgRate)
  return {
    level: tier?.level ?? 1,
    grade: tier?.grade ?? 9,
    title: tier?.title ?? START_TITLE,
    /** 아직 채점 기록이 없어 레벨을 매기지 못한 상태 */
    unranked: tier === null,
  }
}

/**
 * 과정이 바뀐 뒤의 평균 정답률.
 * @param carryRate 직전 과정까지의 평균 (없으면 null)
 * @param courseRate 이번 과정의 평균 (채점 기록이 없으면 null)
 */
export function blendedRate(
  carryRate: number | null,
  courseRate: number | null
): number | null {
  if (courseRate === null) return carryRate
  if (carryRate === null) return courseRate
  return carryRate * COURSE_CARRY_WEIGHT + courseRate * COURSE_NEW_WEIGHT
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
export type ExamStep = '최다빈출' | '최다오답' | '서술형' | '모의고사' | '기출문제'
// 모의고사 세부 유형
export type MockExamType = '실전모의고사' | '기출모의고사' | '직전대비모의고사'
// 기출문제 세부 유형 — 이름만 봐도 무엇인지 알도록 '기출'을 붙여 둔다
export type PastExamType = '학교별기출' | '연도별기출' | '중간고사기출' | '기말고사기출'
export type WorksheetStep = UnitStep | ExamStep

export const UNIT_STEPS: UnitStep[] = ['기초', '기본', '발전', '최상위']
export const EXAM_STEPS: ExamStep[] = ['최다빈출', '최다오답', '서술형', '모의고사', '기출문제']
export const MOCK_EXAM_TYPES: MockExamType[] = ['실전모의고사', '기출모의고사', '직전대비모의고사']
export const PAST_EXAM_TYPES: PastExamType[] = ['학교별기출', '연도별기출', '중간고사기출', '기말고사기출']

/**
 * 세부 유형을 고를 수 있는 스텝. 여기 없는 스텝은 examSubType 을 쓰지 않는다.
 * 스텝이 늘어나면 이 표에만 추가하면 화면·검증이 함께 따라온다.
 */
export const STEP_SUB_TYPES: Partial<Record<WorksheetStep, readonly string[]>> = {
  '모의고사': MOCK_EXAM_TYPES,
  '기출문제': PAST_EXAM_TYPES,
}

/** 이 스텝이 세부 유형을 요구하는지 */
export function stepNeedsSubType(step: string): boolean {
  return (STEP_SUB_TYPES[step as WorksheetStep]?.length ?? 0) > 0
}

/**
 * 화면에 보여줄 단계 이름.
 * 세부 유형이 있으면 그쪽이 더 구체적이라 대신 보여준다. (예: '모의고사' → '실전모의고사')
 */
export function stepDisplayLabel(step: string, examSubType?: string | null): string {
  return examSubType && stepNeedsSubType(step) ? examSubType : step
}

// 스텝별 클리어 기준 정답률 (%)
export const STEP_CLEAR_THRESHOLD: Record<WorksheetStep, number> = {
  '기초':    80,
  '기본':    75,
  '발전':    70,
  '최상위':  65,
  '최다빈출': 75,
  '최다오답': 70,
  '서술형':  60,
  '모의고사': 70,
  '기출문제': 70,
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
  '모의고사': { comprehension: 0.33, reasoning: 0.34, calculation: 0.33 },
  '기출문제': { comprehension: 0.4, reasoning: 0.4, calculation: 0.2 },
}

// 스텝 레이블 (UI 표시용)
export const STEP_LABEL: Record<WorksheetStep, string> = {
  '기초': '기초', '기본': '기본', '발전': '발전', '최상위': '최상위',
  '최다빈출': '최다빈출', '최다오답': '최다오답', '서술형': '서술형', '모의고사': '모의고사',
  '기출문제': '기출문제',
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
  '모의고사': { bg: 'bg-teal-50',   text: 'text-teal-600',   border: 'border-teal-200' },
  '기출문제': { bg: 'bg-cyan-50',   text: 'text-cyan-600',   border: 'border-cyan-200' },
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
