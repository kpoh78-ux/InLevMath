/**
 * packages/shared/src/taxonomy.ts
 * 2022 개정 교육과정 수학 유형 분류 — 공통 타입/상수
 * packages/shared/src/index.ts 맨 아래에 'export * from "./taxonomy"' 를 추가하면
 * 웹(apps/web)과 모바일(apps/mobile) 양쪽에서 @inlevmath/shared 로 쓸 수 있다.
 */

export type SchoolLevelCode = 'ELEMENTARY' | 'MIDDLE' | 'HIGH'
export type SchoolLevel = SchoolLevelCode

/** 1=하, 2=중, 3=상 — 같은 학기·과목 안에서의 상대 난이도 */
export type DifficultyLevel = 1 | 2 | 3

export const DIFFICULTY_LABELS: Record<DifficultyLevel, string> = {
  1: '하',
  2: '중',
  3: '상',
}

/** 난이도별 기본 경험치. 학년 가중을 곱한 값이 ConceptNode.suggestedXp 에 들어있다 */
export const DIFFICULTY_BASE_XP: Record<DifficultyLevel, number> = {
  1: 10,
  2: 20,
  3: 35,
}

/** 난이도 설명 — 학생 화면 툴팁 등에 쓴다 */
export const DIFFICULTY_DESCRIPTIONS: Record<DifficultyLevel, string> = {
  1: '개념 인지·직접 계산',
  2: '적용·변형',
  3: '분석·통합·증명',
}

/** 2022 개정 교육과정 수학과 4개 영역 */
export const MATH_DOMAINS = [
  '수와 연산',
  '변화와 관계',
  '도형과 측정',
  '자료와 가능성',
] as const
export type MathDomain = (typeof MATH_DOMAINS)[number]

/** 고등학교 과목 코드 → 이름 (유형 코드 두 번째 마디) */
export const HIGH_SUBJECTS: Record<string, string> = {
  CM1: '공통수학1',
  CM2: '공통수학2',
  ALG: '대수',
  CAL1: '미적분Ⅰ',
  PRB: '확률과 통계',
  GEO: '기하',
  CAL2: '미적분Ⅱ',
}

/** 유형 코드 한 건. ConceptNode 레코드와 1:1로 대응한다 */
export interface MathUnitType {
  /** 예: "M2-1-01-02-01-03" — 학교급/학년-학기(또는 과목)-대단원-중단원-유형-소유형 */
  code: string
  /** 소유형 이름. 전 과정에서 유일하다 */
  title: string
  domain: MathDomain | string
  gradeLevel: SchoolLevelCode
  semester: number
  subject: string
  majorUnit: string
  middleUnit: string
  typeName: string
  difficulty: DifficultyLevel | number
  /** 1~1474. 전 과정 학습 순번 */
  sequence: number
  /** 0~100. 난이도 곡선 정렬 키 */
  curveScore: number
  suggestedXp: number
  /** 성취기준 코드 배열. 예: ["9수02-08"] */
  achievementStandards: string[] | string
  description: string | null
  status: '적용' | '적용예정' | string
}

export type ConceptTaxonomyNode = MathUnitType & {
  id?: string
  createdAt?: string | Date
}

export interface ConceptTaxonomyEdge {
  id?: string
  prerequisiteCode?: string
  successorCode?: string
  prerequisiteId?: string
  successorId?: string
  weight: number
  dependencyType: 'STRICT' | 'SUPPLEMENTARY' | string
}

export interface StageItem {
  node: ConceptTaxonomyNode
  isUnlocked: boolean
  isCompleted: boolean
  score?: number
  prerequisites: {
    code: string
    title: string
    isSatisfied: boolean
    dependencyType: 'STRICT' | 'SUPPLEMENTARY'
  }[]
}

export interface PrerequisiteDeficit {
  rootDeficitNode: {
    id: string
    code: string
    title: string
    gradeLevel: string
    subject: string
    majorUnit: string
  }
  backtrackDepth: number
  causalPath: string[]
  recommendedClinicNodes: ConceptTaxonomyNode[]
}

/** 유형 코드를 조각으로 분해한다. 코드가 형식에 맞지 않으면 null */
export function parseUnitCode(code: string): {
  school: SchoolLevelCode
  grade: number
  semester: number | null
  subjectCode: string | null
  majorUnit: number
  middleUnit: number
  type: number
  subType: number
} | null {
  const m = code.match(
    /^(?:(E|M)([1-6])-([12])|H-(CM1|CM2|ALG|CAL1|PRB|GEO|CAL2))-(\d{2})-(\d{2})-(\d{2})-(\d{2})$/
  )
  if (!m) return null
  const [, sch, gr, sem, subj, u, mid, t, s] = m
  const high = !!subj
  return {
    school: high ? 'HIGH' : sch === 'E' ? 'ELEMENTARY' : 'MIDDLE',
    grade: high
      ? subj === 'CM1' || subj === 'CM2'
        ? 1
        : subj === 'GEO' || subj === 'CAL2'
          ? 3
          : 2
      : Number(gr),
    semester: high ? null : Number(sem),
    subjectCode: subj ?? null,
    majorUnit: Number(u),
    middleUnit: Number(mid),
    type: Number(t),
    subType: Number(s),
  }
}

/** 소유형 코드에서 한 단계 위(유형) 코드를 얻는다 */
export function typeCodeOf(code: string): string {
  return code.slice(0, code.lastIndexOf('-'))
}

/** 학년 라벨. 예: "중2", "고1" */
export function gradeLabelOf(level: SchoolLevelCode, grade: number): string {
  return ({ ELEMENTARY: '초', MIDDLE: '중', HIGH: '고' } as Record<string, string>)[level] + grade
}
