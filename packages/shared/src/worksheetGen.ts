// packages/shared/src/worksheetGen.ts
//
// 학습지 생성 규칙 — 문제은행에서 문항을 골라 학습지를 만든다.
//
// ── 다섯 가지는 "고르는 방식"만 다르다 ─────────────────────────────────────
//   TYPE      유형별    선생님이 소단원·유형·난이도를 직접 고른다
//   DAILY     일일테스트 최근 배운 범위에서 짧게
//   UNIT_EXAM 단원평가  한 단원을 난이도 골고루
//   WRONG     오답유형  그 학생이 틀린 문항의 유사문제
//   WEAK      취약유형  그 학생의 정답률이 낮은 축에서
//
// 앞의 셋은 **범위**로 뽑고, 뒤의 둘은 **그 학생의 채점 기록**으로 뽑는다.
// 그래서 WRONG·WEAK 는 studentId 가 반드시 있어야 한다.
//
// ── 왜 조건을 저장하나 ──────────────────────────────────────────────────────
// 결과 문항만 남기면 (1) 같은 학습지를 다시 못 뽑고 (2) "왜 이 문제가 나왔지"를
// 따질 수 없다. WorksheetGenRequest.specJson 에 이 형태를 그대로 넣는다.

import type { Difficulty } from './index'

export type WorksheetGenKind = 'TYPE' | 'DAILY' | 'UNIT_EXAM' | 'WRONG' | 'WEAK'

export const WORKSHEET_GEN_KINDS: WorksheetGenKind[] = [
  'TYPE', 'DAILY', 'UNIT_EXAM', 'WRONG', 'WEAK',
]

export const GEN_KIND_META: Record<WorksheetGenKind, {
  label: string
  hint: string
  /** 이 종류의 기본 문항 수 */
  defaultCount: number
  /** 학생을 반드시 골라야 하는가 */
  needsStudent: boolean
  /** 만들어질 학습지의 step (Worksheet.step) */
  step: string
}> = {
  TYPE: {
    label: '유형별 학습지',
    hint: '소단원과 유형을 골라 뽑습니다',
    defaultCount: 20, needsStudent: false, step: '기본',
  },
  DAILY: {
    label: '일일테스트',
    hint: '최근 배운 범위에서 짧게 확인합니다',
    defaultCount: 8, needsStudent: false, step: '기본',
  },
  UNIT_EXAM: {
    label: '단원평가',
    hint: '한 단원을 난이도 골고루 담습니다',
    defaultCount: 25, needsStudent: false, step: '단원평가',
  },
  WRONG: {
    label: '오답유형 학습지',
    hint: '틀린 문항과 같은 유형의 다른 문제를 뽑습니다',
    defaultCount: 15, needsStudent: true, step: '오답유형',
  },
  WEAK: {
    label: '취약유형 학습지',
    hint: '정답률이 낮은 유형에서 뽑습니다',
    defaultCount: 20, needsStudent: true, step: '취약유형',
  },
}

// ── 생성 조건 ───────────────────────────────────────────────────────────────

export interface WorksheetGenSpec {
  kind: WorksheetGenKind
  /** WRONG·WEAK 는 반드시 있어야 한다 */
  studentId?: string
  /** 뽑을 문항 수 */
  count: number

  // 범위 — TYPE·DAILY·UNIT_EXAM 이 쓴다
  subUnitIds?: string[]
  patternTypeIds?: string[]
  conceptNodeIds?: string[]
  /** 난이도 범위 (양끝 포함) */
  difficultyMin?: Difficulty
  difficultyMax?: Difficulty

  // 기간 — DAILY·WRONG 이 쓴다. 며칠 전까지 볼 것인가
  recentDays?: number

  /** 이 학생이 최근에 본 문항을 빼고 뽑는다 (기본 켜짐) */
  excludeRecentlySeen?: boolean
  /** 원본만 뽑을지, 변형(숫자·표현 바꾼 문제)도 섞을지 */
  includeVariants?: boolean
}

// ── 문항 선정 규칙 ──────────────────────────────────────────────────────────
//
// CAT(컴퓨터 적응형 검사)의 문항 선정은 세 단계로 나뉜다 —
// 내용 균형(content balancing) → 선정 기준(selection criterion) → 노출 제어
// (exposure control). 학원 학습지에도 그대로 쓸 수 있고, 셋 다 필요하다.
//   · 내용 균형이 없으면 한 유형만 20문항 나온다
//   · 노출 제어가 없으면 같은 학생이 같은 문제를 반복해서 받는다

/** 최근 이만큼 안에 낸 문항은 다시 뽑지 않는다 (일) */
export const RECENTLY_SEEN_DAYS = 30

/** 한 유형이 학습지의 이 비율을 넘지 않는다 — 내용 균형 */
export const MAX_SHARE_PER_TYPE = 0.4

/** 취약유형으로 보는 정답률 상한 (%) */
export const WEAK_ACCURACY_MAX = 70

/**
 * 취약 판정에 필요한 최소 시도 문항 수.
 *
 * 2~3문항 틀린 것으로 "취약"이라 부르면 우연을 실력으로 오해한다.
 * 분모가 이보다 적은 유형은 취약 목록에 올리지 않는다.
 */
export const WEAK_MIN_ATTEMPTS = 5

/** 단원평가 난이도 배분 — 합이 1이 되게 둔다 */
export const UNIT_EXAM_MIX: Record<Difficulty, number> = {
  1: 0,
  2: 0.2,
  3: 0.4,
  4: 0.28,
  5: 0.12,
}

/**
 * 난이도별로 몇 문항씩 뽑을지 계산한다.
 * 반올림 때문에 합이 어긋나면 가장 큰 칸에서 맞춘다.
 */
export function splitByDifficulty(
  count: number,
  mix: Record<Difficulty, number> = UNIT_EXAM_MIX
): Record<Difficulty, number> {
  const out = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<Difficulty, number>
  const keys: Difficulty[] = [1, 2, 3, 4, 5]
  for (const d of keys) out[d] = Math.round(count * (mix[d] ?? 0))

  let diff = count - keys.reduce((s, d) => s + out[d], 0)
  while (diff !== 0) {
    // 비중이 가장 큰 칸에서 더하거나 뺀다
    const target = keys
      .filter(d => diff > 0 || out[d] > 0)
      .sort((a, b) => (mix[b] ?? 0) - (mix[a] ?? 0))[0]
    if (target == null) break
    out[target] += diff > 0 ? 1 : -1
    diff += diff > 0 ? -1 : 1
  }
  return out
}

/** 한 유형에서 최대 몇 문항까지 담을 수 있는가 */
export function maxPerType(count: number): number {
  return Math.max(1, Math.floor(count * MAX_SHARE_PER_TYPE))
}

// ── 생성 결과 ───────────────────────────────────────────────────────────────

/** 왜 이 문항이 뽑혔나 */
export type GenItemReason = 'match' | 'similar' | 'weak' | 'fill'

export const GEN_ITEM_REASON_LABEL: Record<GenItemReason, string> = {
  match: '조건 일치',
  similar: '오답 유사문제',
  weak: '취약유형',
  fill: '수가 모자라 채움',
}

export interface WorksheetGenTrace {
  /** 조건에 맞는 후보가 몇 개였나 */
  candidates: number
  /** 최근에 낸 문항이라 뺀 수 */
  excludedRecent: number
  /** 한 유형 상한에 걸려 뺀 수 */
  excludedShare: number
  /** 원하는 수를 못 채웠으면 몇 개 모자랐나 */
  shortBy: number
  /** 사람이 읽을 설명 — 화면에 그대로 보여 준다 */
  notes: string[]
}

export interface WorksheetGenResult {
  kind: WorksheetGenKind
  title: string
  wanted: number
  produced: number
  items: {
    questionId: string
    number: number
    reason: GenItemReason
    sourceQuestionId?: string
  }[]
  trace: WorksheetGenTrace
}

/**
 * 조건을 검증한다. 순수 함수 — DB 를 보지 않는다.
 *
 * "문항이 실제로 있는가"는 서버가 따로 판단한다. 여기서는 형태만 본다.
 */
export function validateGenSpec(spec: WorksheetGenSpec): string[] {
  const errors: string[] = []
  const meta = GEN_KIND_META[spec.kind]
  if (!meta) return ['알 수 없는 학습지 종류입니다.']

  if (!Number.isInteger(spec.count) || spec.count < 1 || spec.count > 50) {
    errors.push('문항 수는 1~50 사이여야 합니다.')
  }
  if (meta.needsStudent && !spec.studentId) {
    errors.push(`${meta.label}는 학생을 골라야 만들 수 있습니다.`)
  }
  if (spec.kind === 'TYPE' && !spec.subUnitIds?.length && !spec.patternTypeIds?.length) {
    errors.push('소단원이나 유형을 하나 이상 골라야 합니다.')
  }
  if (spec.kind === 'UNIT_EXAM' && !spec.subUnitIds?.length) {
    errors.push('단원평가는 단원(소단원)을 골라야 합니다.')
  }
  if (
    spec.difficultyMin != null && spec.difficultyMax != null &&
    spec.difficultyMin > spec.difficultyMax
  ) {
    errors.push('난이도 범위가 뒤집혀 있습니다.')
  }
  return errors
}
