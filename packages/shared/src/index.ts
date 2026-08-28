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
// 채점 기록이 아직 없으면 맨 아래 단계인 Lv.1 비기너에서 시작한다.
//
// 최근 학습에 무게를 둔다.
//   70% — 지금 진도를 나가는 교재 + 최근 90일 안에 푼 학습지
//   30% — 끝낸 교재 + 90일이 지난 학습지
// 교재를 끝내면 그 교재는 '지난 과정'으로 넘어가 30% 쪽으로 옮겨간다.

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
  { level: 1, grade: 9, title: '비기너',       minRate: 0 },
]

/** 채점 기록이 없는 학생도 Lv.1 비기너에서 시작한다 */
export const START_LEVEL = 1

/** 지난 과정(끝낸 교재 + 오래된 학습지) 반영 비중 */
export const PAST_WEIGHT = 0.3
/** 현재 과정(진행 중 교재 + 최근 학습지) 반영 비중 */
export const CURRENT_WEIGHT = 0.7
/** 학습지를 '최근'으로 볼 기간 (일) */
export const RECENT_WORKSHEET_DAYS = 90

/**
 * 푼 문제 수에 따른 칭호 상한.
 * 몇 문제 안 풀고 우연히 높은 정답률이 나온 학생이 상위 칭호를 가져가지 못하게 한다.
 * 표는 문제 수가 적은 쪽부터 본다.
 */
export const TITLE_CAPS: { maxProblems: number; capLevel: number }[] = [
  { maxProblems: 300, capLevel: 1 },  // 300문제 미만 — 비기너까지
  { maxProblems: 600, capLevel: 4 },  // 600문제 미만 — 스텐다드까지
  { maxProblems: 900, capLevel: 7 },  // 900문제 미만 — 마스터까지
]
/** 이 문제 수부터는 정답률만으로 모든 칭호가 열린다 */
export const TITLE_CAP_FREE_AT = 900

/** 푼 문제 수로 정해지는 레벨 상한 (제한 없으면 9) */
export function levelCapFor(totalProblems: number): number {
  const cap = TITLE_CAPS.find(c => totalProblems < c.maxProblems)
  return cap ? cap.capLevel : 9
}

/** 평균 정답률(%) → 레벨 단계. 기록이 없으면(null) 입문자 단계 */
export function levelTierOf(avgRate: number | null | undefined): LevelTier | null {
  if (avgRate === null || avgRate === undefined || Number.isNaN(avgRate)) return null
  return LEVEL_TIERS.find(t => avgRate >= t.minRate) ?? LEVEL_TIERS[LEVEL_TIERS.length - 1]
}

/**
 * 화면에 쓸 레벨/등급/칭호 한 벌.
 *
 * @param avgRate       평균 정답률(%). 기록이 없으면 null → '수학 입문자'
 * @param totalProblems 지금까지 푼 문제 수. 적으면 칭호에 상한이 걸린다
 */
export function levelInfoOf(
  avgRate: number | null | undefined,
  totalProblems = TITLE_CAP_FREE_AT
) {
  const tier = levelTierOf(avgRate)
  if (!tier) {
    // 아직 채점 기록이 없다 — 맨 아래 단계(비기너)에서 시작한다
    const start = LEVEL_TIERS.find(t => t.level === START_LEVEL) ?? LEVEL_TIERS[LEVEL_TIERS.length - 1]
    return {
      level: start.level, grade: start.grade, title: start.title,
      unranked: true, capped: false, capLevel: levelCapFor(totalProblems),
    }
  }

  const capLevel = levelCapFor(totalProblems)
  const capped = tier.level > capLevel
  const shown = capped
    ? LEVEL_TIERS.find(t => t.level === capLevel) ?? tier
    : tier

  return {
    level: shown.level,
    grade: shown.grade,
    title: shown.title,
    unranked: false,
    /** 정답률로는 더 높지만 푼 문제 수가 모자라 상한에 걸린 상태 */
    capped,
    capLevel,
  }
}

/**
 * 등급에 쓰는 평균 정답률.
 * 한쪽 기록이 없으면 있는 쪽만 그대로 쓴다(비중을 억지로 나누지 않는다).
 *
 * @param pastRate    끝낸 교재 + 90일 지난 학습지의 평균 (없으면 null)
 * @param currentRate 진행 중 교재 + 최근 90일 학습지의 평균 (없으면 null)
 */
export function blendedRate(
  pastRate: number | null,
  currentRate: number | null
): number | null {
  if (currentRate === null) return pastRate
  if (pastRate === null) return currentRate
  return pastRate * PAST_WEIGHT + currentRate * CURRENT_WEIGHT
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

// ── 학생 답안 채점 ──────────────────────────────────────────────────────────
//
// 학생이 OMR·수식 키패드로 넣은 답을 저장된 정답과 맞춰 1차 채점한다.
// 사람이 보기엔 같은 답인데 표기가 달라 오답이 되는 일이 없도록 표기를 통일한다.
// 그래도 애매한 단답형은 pending 으로 남겨 선생님이 최종 판단한다.

export type ProblemAnswerType = 'multiple' | 'short'

const CIRCLED_DIGITS = '①②③④⑤⑥⑦⑧⑨⑩'

/** 학습지 정답에는 유형 정보가 없어 정답 모양으로 객관식/단답형을 가른다 */
export function inferAnswerType(answer: string): ProblemAnswerType {
  const t = (answer ?? '').trim()
  if (CIRCLED_DIGITS.includes(t)) return 'multiple'
  return /^[1-5]$/.test(t) ? 'multiple' : 'short'
}

/** 비교용 표기 통일 — 공백·단위·동그라미 숫자를 정리한다 */
export function normalizeForCompare(value: string): string {
  let t = (value ?? '').normalize('NFKC').trim()
  // 빈 값을 그냥 두면 아래 indexOf('') 가 0을 돌려줘 '1' 로 바뀐다.
  // 그러면 답을 안 쓴 문항이 정답 1번과 같아져 맞은 것으로 처리된다.
  if (t === '') return ''

  // ①②③ → 1,2,3
  const circled = CIRCLED_DIGITS.indexOf(t)
  if (circled >= 0) return String(circled + 1)

  t = t.toLowerCase()
  t = t.replace(/\s+/g, '')            // 모든 공백 제거
  // 콤마는 천단위 구분자일 때만 지운다 (1,000 → 1000).
  // "1,2" 처럼 뒤가 세 자리가 아니면 답 두 개를 나눈 것으로 보고 그대로 둔다 —
  // 지워 버리면 "1,2" 가 12 와 같아져 엉뚱하게 정답 처리된다.
  t = t.replace(/,(?=\d{3}(?!\d))/g, '')
  // 학생에게 단위를 빼고 쓰라고 안내하지만 붙여 쓰는 경우가 있어 뒤쪽 단위를 떼어낸다
  t = t.replace(/(cm2|cm3|m2|m3|cm|mm|km|kg|g|ml|l|개|명|원|점|초|분|시간|도|배|쪽|권|자루)$/u, '')
  t = t.replace(/[.]$/, '')             // 끝의 마침표
  return t
}

/**
 * 객관식 복수 정답을 번호 배열로 나눈다.
 * "①③", "1,3", "1 3", "①, ③" 모두 ['1','3'] 이 된다.
 * 고른 순서는 채점에 영향을 주지 않으므로 정렬해 돌려준다.
 * 복수 정답 형태가 아니면 null.
 */
export function splitMultiAnswer(value: string): string[] | null {
  // NFKC 정규화는 ①③ 을 13 으로 바꿔 버린다. 원문자 판정은 반드시 그 전에 한다.
  const raw = (value ?? '').trim()
  if (raw === '') return null

  const circled = [...raw].filter(ch => CIRCLED_DIGITS.includes(ch))
  const nonSpace = [...raw].filter(ch => !/\s/.test(ch))
  if (circled.length >= 2 && circled.length === nonSpace.length) {
    // "①③" / "③ ①" — 고른 순서는 채점에 영향을 주지 않으므로 정렬한다
    return circled.map(ch => String(CIRCLED_DIGITS.indexOf(ch) + 1)).sort()
  }

  // 구분자로 나눈 경우 — "1,3" / "1 3" / "①, ③"
  const parts = raw.split(/[,،、\s/·]+/).map(v => v.trim()).filter(v => v !== '')
  if (parts.length < 2) return null
  const nums = parts.map(normalizeForCompare)
  // 조각이 전부 1~5 보기 번호일 때만 복수 정답으로 본다 (식·좌표를 잘라먹지 않게)
  if (!nums.every(n => /^[1-5]$/.test(n))) return null
  return [...nums].sort()
}

/**
 * 학생 답이 정답과 같은지.
 * 판정할 수 없으면 null 을 돌려준다 (정답이 비어 있거나 이미지인 경우).
 */
export function answersMatch(
  studentAnswer: string,
  correctAnswer: string
): boolean | null {
  const correct = (correctAnswer ?? '').trim()
  if (correct === '' || correct === IMAGE_ANSWER_MARKER) return null

  // 복수 정답(객관식 2개 이상 고르기) — ①③ 과 ③① 을 같게 본다
  const multi = splitMultiAnswer(correct)
  if (multi) {
    const got = splitMultiAnswer(studentAnswer)
    if (!got) return false
    return multi.length === got.length && multi.every((v, i) => v === got[i])
  }

  const a = normalizeForCompare(studentAnswer)
  const b = normalizeForCompare(correct)
  if (a === '') return false
  if (a === b) return true

  // 12 와 12.0 처럼 값은 같고 표기만 다른 경우
  const na = Number(a), nb = Number(b)
  if (Number.isFinite(na) && Number.isFinite(nb) && na === nb) return true

  // "x=5" 와 "5" — 좌변이 같은 미지수면 값만 비교한다
  const strip = (v: string) => /^[a-z]=(.+)$/.exec(v)?.[1] ?? v
  return strip(a) === strip(b)
}

/** 정답 이미지 자리표시자 — apps/web 의 lib/answers.ts 와 같은 값이어야 한다 */
export const IMAGE_ANSWER_MARKER = '__img__'

export type AutoGradeResult = {
  /** 맞은 문제 번호 (1-based) */
  correct: number[]
  /** 틀린 문제 번호 */
  wrong: number[]
  /** 자동으로 판정하지 못해 선생님 확인이 필요한 문제 번호 */
  pending: number[]
}

/** 학생 답안 배열과 정답 배열을 맞춰 1차 채점한다 */
export function autoGrade(
  studentAnswers: string[],
  correctAnswers: string[],
  total: number
): AutoGradeResult {
  const result: AutoGradeResult = { correct: [], wrong: [], pending: [] }
  for (let i = 0; i < total; i++) {
    const verdict = answersMatch(studentAnswers[i] ?? '', correctAnswers[i] ?? '')
    const no = i + 1
    if (verdict === null) result.pending.push(no)
    else if (verdict) result.correct.push(no)
    else result.wrong.push(no)
  }
  return result
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
// ── 문제 난이도 ─────────────────────────────────────────────────────────────
//
// 문제은행의 공식 척도는 1~5 하나뿐이다. 예전에는 세 군데가 제각각이었다 —
// ConceptNode 는 1~3, MathPatternType·Question 은 3 기본값, 학습지는 기초/기본/
// 발전/최상위 문자열. 서로 비교할 수 없어 "이 문제가 저 문제보다 어렵나"를
// 답할 수 없었다.
//
// 시드된 ConceptNode.difficulty(1~3) 는 그대로 두고 읽을 때 환산한다 —
// 1,474행을 고쳐 쓰는 것보다 환산 한 줄이 안전하다.

export const DIFFICULTY_MIN = 1
export const DIFFICULTY_MAX = 5
export type Difficulty = 1 | 2 | 3 | 4 | 5
export const DIFFICULTIES: Difficulty[] = [1, 2, 3, 4, 5]

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  1: '최하',
  2: '하',
  3: '중',
  4: '상',
  5: '최상',
}

/** 1~5 밖의 값이 들어오면 잘라 낸다. 숫자가 아니면 null */
export function clampDifficulty(value: unknown): Difficulty | null {
  const n = Math.round(Number(value))
  if (!Number.isFinite(n)) return null
  return Math.min(DIFFICULTY_MAX, Math.max(DIFFICULTY_MIN, n)) as Difficulty
}

/** ConceptNode 의 1~3 척도를 공식 1~5 로 환산한다 */
export function conceptDifficultyTo5(value: number): Difficulty {
  if (value <= 1) return 1
  if (value >= 3) return 5
  return 3
}

/** 학습지 단계 → 난이도. 단계가 없거나 모르는 값이면 null */
export function stepToDifficulty(step: string): Difficulty | null {
  switch (step) {
    case '기초': return 2
    case '기본': return 3
    case '발전': return 4
    case '최상위': return 5
    case '서술형': return 4
    case '최다빈출': return 3
    case '최다오답': return 4
    default: return null
  }
}

// 최상위 다음은 '틀린 문제로 다시 만든 학습지' 두 종류다.
//   취약유형 — 자주 틀리는 유형을 모아 다시 낸다 (유형 단위)
//   오답유형 — 실제로 틀린 문항을 다시 낸다 (문항 단위)
// 단원평가는 그 단원을 마무리하며 보는 시험이라 맨 끝에 온다.
export type UnitStep = '기초' | '기본' | '발전' | '최상위' | '취약유형' | '오답유형' | '단원평가'
// 내신대비 스텝
export type ExamStep = '최다빈출' | '최다오답' | '서술형' | '모의고사' | '기출문제'
// 모의고사 세부 유형
export type MockExamType = '실전모의고사' | '기출모의고사' | '직전대비모의고사'
// 기출문제 세부 유형 — 이름만 봐도 무엇인지 알도록 '기출'을 붙여 둔다
export type PastExamType = '학교별기출' | '연도별기출' | '중간고사기출' | '기말고사기출'
export type WorksheetStep = UnitStep | ExamStep

export const UNIT_STEPS: UnitStep[] = ['기초', '기본', '발전', '최상위', '취약유형', '오답유형', '단원평가']
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
  '취약유형': 70,
  '오답유형': 70,
  '단원평가': 70,
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
  // 약한 곳을 다시 푸는 단계라 이해력에 무게를 둔다
  '취약유형': { comprehension: 0.5, reasoning: 0.3, calculation: 0.2 },
  '오답유형': { comprehension: 0.5, reasoning: 0.3, calculation: 0.2 },
  // 단원 전체를 확인하는 시험이라 세 영역을 고르게 본다
  '단원평가': { comprehension: 0.34, reasoning: 0.33, calculation: 0.33 },
  '최다빈출': { comprehension: 0.4, reasoning: 0.4, calculation: 0.2 },
  '최다오답': { comprehension: 0.5, reasoning: 0.3, calculation: 0.2 },
  '서술형':  { reasoning: 0.5, comprehension: 0.4, calculation: 0.1 },
  '모의고사': { comprehension: 0.33, reasoning: 0.34, calculation: 0.33 },
  '기출문제': { comprehension: 0.4, reasoning: 0.4, calculation: 0.2 },
}

// 스텝 레이블 (UI 표시용)
export const STEP_LABEL: Record<WorksheetStep, string> = {
  '기초': '기초', '기본': '기본', '발전': '발전', '최상위': '최상위',
  '취약유형': '취약유형', '오답유형': '오답유형', '단원평가': '단원평가',
  '최다빈출': '최다빈출', '최다오답': '최다오답', '서술형': '서술형', '모의고사': '모의고사',
  '기출문제': '기출문제',
}

// 스텝별 배지 색상 (Tailwind 클래스)
export const STEP_COLOR: Record<WorksheetStep, { bg: string; text: string; border: string }> = {
  '기초':    { bg: 'bg-sky-50',    text: 'text-sky-600',    border: 'border-sky-200' },
  '기본':    { bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-200' },
  '발전':    { bg: 'bg-amber-50',  text: 'text-amber-600',  border: 'border-amber-200' },
  '최상위':  { bg: 'bg-rose-50',   text: 'text-rose-600',   border: 'border-rose-200' },
  '취약유형': { bg: 'bg-fuchsia-50', text: 'text-fuchsia-600', border: 'border-fuchsia-200' },
  '오답유형': { bg: 'bg-red-50',    text: 'text-red-600',    border: 'border-red-200' },
  '단원평가': { bg: 'bg-indigo-50', text: 'text-indigo-600', border: 'border-indigo-200' },
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

// ─── IRT 3PL 및 컴퓨터 적응형 진단 평가 (CAT Engine) 타입 ────────────────────
export interface IrtItemParams {
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

export interface IrtUserResponse {
  item: IrtItemParams
  isCorrect: boolean
  timeSpentSec: number
  submittedAnswer?: string
}

export interface DiagnosticCapabilityRadar {
  calculation: number      // 계산력
  comprehension: number    // 이해력
  reasoning: number        // 추론력
  problemSolving: number   // 문제해결력
  application: number      // 응용력
}

// ─── 초3~고3 K-수학 4계층 체계화 (대단원 ➡️ 중단원 ➡️ 소단원 ➡️ 문제유형) 타입 ───
export type MathGradeSubjectCode =
  | 'ELEM_3_1' | 'ELEM_3_2' | 'ELEM_4_1' | 'ELEM_4_2'
  | 'ELEM_5_1' | 'ELEM_5_2' | 'ELEM_6_1' | 'ELEM_6_2'
  | 'MID_1_1'  | 'MID_1_2'  | 'MID_2_1'  | 'MID_2_2'  | 'MID_3_1'  | 'MID_3_2'
  | 'HIGH_COMMON_1' | 'HIGH_COMMON_2' | 'HIGH_ALGEBRA' | 'HIGH_CALC_1'
  | 'HIGH_CALC_2'   | 'HIGH_PROB_STAT' | 'HIGH_GEOMETRY'

export interface MathMajorUnitDto {
  id: string
  subject: MathGradeSubjectCode
  orderIndex: number
  code: string
  name: string
  middleUnits?: MathMiddleUnitDto[]
}

export interface MathMiddleUnitDto {
  id: string
  majorUnitId: string
  orderIndex: number
  code: string
  name: string
  subUnits?: MathSubUnitDto[]
}

export interface MathSubUnitDto {
  id: string
  middleUnitId: string
  orderIndex: number
  code: string
  name: string
  patternTypes?: MathPatternTypeDto[]
}

export interface MathPatternTypeDto {
  id: string
  subUnitId: string
  typeCode: string
  typeName: string
  difficulty: number
}

export interface StudentSubUnitStatDto {
  id: string
  studentId: string
  subUnitId: string
  totalSolved: number
  correctCount: number
  accuracyRate: number
  updatedAt: string
}

export interface StudentPatternStatDto {
  id: string
  studentId: string
  patternTypeId: string
  totalSolved: number
  correctCount: number
  accuracyRate: number
  updatedAt: string
}

// 2022 개정 수학 지식 그래프 및 스테이지 공통 타입
export * from './taxonomy'

// 멀티 디바이스 반응형 뷰포트 훅
export * from './hooks/useResponsiveViewport'




// 문제 반입 계약 — 문제집 반입 앱과 주고받는 JSON 형식과 난이도 규칙
export * from "./questionImport"
