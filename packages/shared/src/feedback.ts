// packages/shared/src/feedback.ts
//
// 채점 결과를 학생에게 어떤 말로 돌려줄지 정하는 곳.
//
// ── 왜 한곳에 모았나 ────────────────────────────────────────────────────────
// 학습지 채점·교재 채점·미션 결과가 각각 다른 말로 칭찬하거나 다그치면
// 학생은 기준을 알 수 없다. 등급과 문구를 여기서 한 번만 정하고
// 서버(피드백 생성)와 학생 앱(팝업)이 같은 것을 본다.
//
// ── 다루는 상황 ─────────────────────────────────────────────────────────────
//   1. 이번 채점 자체가 잘됐나 — 5단계 등급
//   2. 지난번보다 올랐나 내렸나 — 성적 변화
//   3. 레벨이 올랐나, 내려갔나, 내려가기 직전인가 — 레벨 변화
//
// 세 가지는 따로 논다. 90점을 받아도 지난번 95점보다는 떨어진 것이고,
// 레벨은 누적 평균이라 한 번 잘 봐도 안 오를 수 있다. 셋을 뭉뚱그리면
// "잘했다"와 "성적이 떨어졌다"가 동시에 나와 학생이 헷갈린다.

import { LEVEL_TIERS } from './index'

// ── 1. 5단계 등급 ───────────────────────────────────────────────────────────

export type FeedbackGrade = 'perfect' | 'great' | 'good' | 'soso' | 'poor'

export const FEEDBACK_GRADES: FeedbackGrade[] = ['perfect', 'great', 'good', 'soso', 'poor']

export type FeedbackTone = 'celebrate' | 'praise' | 'neutral' | 'nudge' | 'warn'

export type FeedbackGradeInfo = {
  grade: FeedbackGrade
  /** 이 등급에 드는 최소 정답률 */
  minRate: number
  label: string
  /** 팝업 제목 */
  title: string
  /** 팝업 본문 */
  message: string
  tone: FeedbackTone
  /** 상황에 맞는 소리 단서. 앱이 이 이름으로 파일을 찾는다 */
  sound: SoundCue
  icon: string
}

/**
 * 정답률 5단계.
 *
 * 경계를 70/50 에 둔 이유 — 미션 클리어 기준이 70~85% 라
 * 70 미만은 "다시 봐야 하는" 구간이고, 50 미만은 개념을 놓친 구간이다.
 */
export const FEEDBACK_GRADE_TABLE: FeedbackGradeInfo[] = [
  {
    grade: 'perfect', minRate: 95, label: '완벽',
    title: '완벽합니다!', message: '거의 다 맞혔습니다. 이 단원은 확실히 잡았습니다.',
    tone: 'celebrate', sound: 'perfect', icon: '🏆',
  },
  {
    grade: 'great', minRate: 85, label: '훌륭',
    title: '훌륭합니다!', message: '잘 풀었습니다. 틀린 문제만 다시 보면 됩니다.',
    tone: 'praise', sound: 'great', icon: '⭐',
  },
  {
    grade: 'good', minRate: 70, label: '좋음',
    title: '잘했습니다', message: '기준을 넘었습니다. 틀린 문제를 꼭 확인하세요.',
    tone: 'neutral', sound: 'good', icon: '👍',
  },
  {
    grade: 'soso', minRate: 50, label: '조금 더',
    title: '조금 더 봐야겠습니다', message: '절반은 넘겼지만 기준에는 못 미쳤습니다. 틀린 부분을 다시 풀어 보세요.',
    tone: 'nudge', sound: 'soso', icon: '📗',
  },
  {
    grade: 'poor', minRate: 0, label: '분발',
    title: '개념부터 다시 봅시다', message: '많이 틀렸습니다. 선생님과 함께 개념을 다시 확인하세요.',
    tone: 'warn', sound: 'poor', icon: '📕',
  },
]

export function gradeOf(correctRate: number): FeedbackGradeInfo {
  const rate = Number.isFinite(correctRate) ? correctRate : 0
  return (
    FEEDBACK_GRADE_TABLE.find(g => rate >= g.minRate) ??
    FEEDBACK_GRADE_TABLE[FEEDBACK_GRADE_TABLE.length - 1]
  )
}

// ── 2. 성적 변화 ────────────────────────────────────────────────────────────

export type ScoreTrend = 'up' | 'same' | 'down' | 'first'

/** 이만큼은 움직여야 "올랐다/떨어졌다"고 본다 (%p) — 1~2점 흔들림까지 알리면 시끄럽다 */
export const SCORE_TREND_MARGIN = 3

export function trendOf(current: number, previous: number | null): ScoreTrend {
  if (previous == null) return 'first'
  const diff = current - previous
  if (diff >= SCORE_TREND_MARGIN) return 'up'
  if (diff <= -SCORE_TREND_MARGIN) return 'down'
  return 'same'
}

export const TREND_TEXT: Record<ScoreTrend, string> = {
  up: '성적이 올랐습니다!',
  same: '지난번과 비슷합니다',
  down: '성적이 떨어졌습니다',
  first: '첫 기록입니다',
}

// ── 3. 레벨 변화 ────────────────────────────────────────────────────────────

export type LevelChange = 'up' | 'same' | 'near_down' | 'down'

/**
 * 지금 레벨을 유지하는 데 필요한 정답률에 이만큼까지 다가오면 경고한다 (%p).
 *
 * 레벨은 누적 평균이라 한 번 못 봤다고 바로 떨어지지 않는다. 떨어지고 나서
 * 알리면 이미 늦으므로, 경계에 다가섰을 때 미리 알려 만회할 틈을 준다.
 */
export const LEVEL_DOWN_WARN_MARGIN = 3

/** 지금 레벨을 지키는 하한 정답률. 못 찾으면 null */
export function keepLevelMinRate(level: number): number | null {
  return LEVEL_TIERS.find(t => t.level === level)?.minRate ?? null
}

/**
 * 레벨이 어떻게 됐는지 판정한다.
 *
 * 올라가거나 내려간 것이 우선이고, 그대로일 때만 '내려가기 직전'인지 본다.
 */
export function levelChangeOf(
  before: number | null,
  after: number,
  avgRate: number | null
): LevelChange {
  if (before != null && after > before) return 'up'
  if (before != null && after < before) return 'down'

  const floor = keepLevelMinRate(after)
  if (avgRate != null && floor != null && after > 1 && avgRate - floor < LEVEL_DOWN_WARN_MARGIN) {
    return 'near_down'
  }
  return 'same'
}

export type LevelChangeInfo = {
  title: string
  message: string
  tone: FeedbackTone
  sound: SoundCue
  /** 경고 화면 색 — 앱이 이 색으로 창을 물들인다 */
  accent: 'gold' | 'orange' | 'red' | 'none'
}

export function levelChangeInfo(change: LevelChange, level: number): LevelChangeInfo | null {
  switch (change) {
    case 'up':
      return {
        title: `Lv.${level}로 레벨업!`,
        message: '축하합니다. 다음 단계가 열렸습니다.',
        tone: 'celebrate', sound: 'levelup', accent: 'gold',
      }
    case 'near_down':
      return {
        title: '레벨 다운 근접',
        message: `조금만 더 떨어지면 Lv.${level - 1}로 내려갑니다. 틀린 문제를 다시 풀어 만회하세요.`,
        tone: 'nudge', sound: 'warn', accent: 'orange',
      }
    case 'down':
      return {
        title: '레벨 다운! 레벨 다운!',
        message: `Lv.${level}로 내려갔습니다. 최근 성적이 많이 떨어졌습니다. 선생님과 확인하세요.`,
        tone: 'warn', sound: 'leveldown', accent: 'red',
      }
    default:
      return null
  }
}

// ── 소리 ────────────────────────────────────────────────────────────────────

/**
 * 상황별 소리 이름. 앱은 이 이름으로 파일을 찾는다.
 * 파일이 없으면 소리 없이 화면만 나온다 (앱은 정상 동작).
 */
export type SoundCue =
  | 'perfect' | 'great' | 'good' | 'soso' | 'poor'
  | 'levelup' | 'leveldown' | 'warn' | 'quest'

export const SOUND_CUES: SoundCue[] = [
  'perfect', 'great', 'good', 'soso', 'poor',
  'levelup', 'leveldown', 'warn', 'quest',
]

// ── 하나로 묶은 채점 피드백 ─────────────────────────────────────────────────

export type GradingFeedback = {
  /** 이번 채점 정답률 (0~100) */
  correctRate: number
  correctProblems: number
  totalProblems: number

  grade: FeedbackGrade
  gradeLabel: string
  title: string
  message: string
  tone: FeedbackTone
  icon: string
  sound: SoundCue

  /** 지난번 같은 종류 채점과 견준 결과 */
  trend: ScoreTrend
  trendText: string
  previousRate: number | null

  /** 레벨 변화 — 없으면 null */
  levelChange: LevelChange
  levelBefore: number | null
  levelAfter: number
  levelTitle: string | null
  levelMessage: string | null
  levelAccent: 'gold' | 'orange' | 'red' | 'none'
  /** 레벨을 지키는 데 필요한 정답률 */
  keepLevelRate: number | null
  avgRate: number | null

  /** 다음에 할 일 한 줄 */
  nextStep: string | null
}

/**
 * 채점 한 건의 피드백을 만든다. 순수 함수 — DB 를 보지 않는다.
 *
 * 레벨 변화가 있으면 그것이 화면의 주인공이 되고(축하든 경고든),
 * 없으면 이번 채점 등급이 주인공이 된다. 서버는 값만 채우고
 * 무엇을 크게 보여 줄지는 이 함수가 정한 tone·accent 로 앱이 결정한다.
 */
export function buildGradingFeedback(input: {
  correctProblems: number
  totalProblems: number
  previousRate: number | null
  levelBefore: number | null
  levelAfter: number
  avgRate: number | null
  nextStep?: string | null
}): GradingFeedback {
  const total = Math.max(0, input.totalProblems)
  const correct = Math.max(0, Math.min(input.correctProblems, total))
  const correctRate = total > 0 ? Math.round((correct / total) * 100) : 0

  const g = gradeOf(correctRate)
  const trend = trendOf(correctRate, input.previousRate)
  const change = levelChangeOf(input.levelBefore, input.levelAfter, input.avgRate)
  const changeInfo = levelChangeInfo(change, input.levelAfter)

  return {
    correctRate,
    correctProblems: correct,
    totalProblems: total,

    grade: g.grade,
    gradeLabel: g.label,
    title: g.title,
    message: g.message,
    tone: g.tone,
    icon: g.icon,
    // 레벨이 움직였으면 그 소리가 우선이다 — 축하와 경고는 등급보다 크게 들려야 한다
    sound: changeInfo?.sound ?? g.sound,

    trend,
    trendText: TREND_TEXT[trend],
    previousRate: input.previousRate,

    levelChange: change,
    levelBefore: input.levelBefore,
    levelAfter: input.levelAfter,
    levelTitle: changeInfo?.title ?? null,
    levelMessage: changeInfo?.message ?? null,
    levelAccent: changeInfo?.accent ?? 'none',
    keepLevelRate: keepLevelMinRate(input.levelAfter),
    avgRate: input.avgRate,

    nextStep: input.nextStep ?? null,
  }
}
