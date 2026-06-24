// InLevMath 공유 타입 및 상수

export type MissionType =
  | 'concept_learning'      // 개념익히기
  | 'concept_problem'       // 개념확인문제
  | 'basic_problem'         // 기본문제
  | 'advanced_problem'      // 발전문제
  | 'top_problem'           // 최상위문제

export type UserRole = 'student' | 'teacher'

export interface MissionResult {
  missionType: MissionType
  totalProblems: number
  correctProblems: number
  source: 'mathflat' | 'manual'  // 매쓰플랫 자동 or 수동 입력
  solvedAt: string               // ISO 날짜
}

export interface AbilityScore {
  comprehension: number  // 이해력 (0~100)
  reasoning: number      // 추론력 (0~100)
  calculation: number    // 계산력 (0~100)
}

export interface StudentLevel {
  currentLevel: number
  currentMission: MissionType
  abilityScore: AbilityScore
  missionCleared: boolean
}

export const MISSION_LABELS: Record<MissionType, string> = {
  concept_learning: '개념익히기',
  concept_problem: '개념확인문제',
  basic_problem: '기본문제',
  advanced_problem: '발전문제',
  top_problem: '최상위문제',
}

export const MISSION_ORDER: MissionType[] = [
  'concept_learning',
  'concept_problem',
  'basic_problem',
  'advanced_problem',
  'top_problem',
]
