// 학생 레벨·칭호 계산 (Lv.1 ~ Lv.9)
//
// 레벨은 평균 정답률 하나로 정해진다. 등급표와 칭호는 packages/shared 에 있다.
//
// 최근 학습에 무게를 둔다.
//   현재 과정 (70%) — 최근 90일 안에 푼 학습지
//   지난 과정 (30%) — 90일이 지난 학습지
//
// 학습지는 채점일이 90일을 넘기면 자동으로 30% 쪽으로 넘어간다.
// 한쪽 기록이 없으면 있는 쪽만 그대로 쓴다.
//
// 푼 문제 수가 적으면 칭호에 상한이 걸린다 (TITLE_CAPS).
// 300문제 미만은 비기너, 600문제 미만은 스텐다드, 900문제 미만은 마스터까지다.
// 몇 문제 안 풀고 나온 높은 정답률이 상위 칭호로 이어지지 않게 한다.
//
// 평균은 누적해서 더하지 않고 매번 채점 기록에서 다시 계산한다.
// 선생님이 같은 학습지를 다시 채점해도 두 번 반영되지 않고,
// 날짜가 지나면 별도 처리 없이 저절로 비중이 옮겨간다.

import { prisma } from '@/lib/db'
import { blendedRate, levelInfoOf, RECENT_WORKSHEET_DAYS } from '@inlevmath/shared'

export type LevelSnapshot = {
  /** 반영된 평균 정답률(%). 채점 기록이 전혀 없으면 null */
  avgCorrectRate: number | null
  level: number
  grade: number
  title: string
  unranked: boolean
  /** 정답률로는 더 높지만 푼 문제 수가 모자라 상한에 걸린 상태 */
  capped: boolean
  /** 지금 푼 문제 수로 열리는 최대 레벨 */
  capLevel: number
  /** 현재 과정(70%) 평균 */
  currentRate: number | null
  /** 지난 과정(30%) 평균 */
  pastRate: number | null
  totalProblems: number

  /**
   * 다시 계산하기 **전** 레벨. 레벨이 오르내렸는지는 이것과 견줘야 알 수 있다.
   * 갱신된 값만 돌려주면 학생에게 "레벨업"도 "레벨 다운"도 알릴 수 없다.
   * 저장된 값이 없던 학생이면 null.
   */
  levelBefore: number | null
  /** 다시 계산하기 전 평균 정답률 */
  avgRateBefore: number | null
}

/** 맞은 개수·전체 개수를 모으는 통 */
class Bucket {
  correct = 0
  total = 0
  add(correct: number, total: number) {
    if (total <= 0) return
    this.total += total
    this.correct += Math.max(0, Math.min(correct, total))
  }
  get rate(): number | null {
    return this.total > 0 ? (this.correct / this.total) * 100 : null
  }
}

/** 현재/지난 과정으로 나눠 정답률을 계산한다 */
async function splitAverages(studentId: string) {
  const current = new Bucket()
  const past = new Bucket()

  const cutoff = new Date(Date.now() - RECENT_WORKSHEET_DAYS * 24 * 60 * 60 * 1000)

  // ── 학습지 — 채점일이 90일 이내면 현재, 지나면 지난 과정 ──
  const dists = await prisma.worksheetDistribution.findMany({
    where: { studentId, result: { isNot: null } },
    select: {
      worksheet: { select: { problemCount: true } },
      result: { select: { correctProblems: true, submittedAt: true, submittedCount: true } },
    },
  })
  for (const d of dists) {
    if (!d.result) continue
    const bucket = d.result.submittedAt >= cutoff ? current : past
    // 부분 제출이면 낸 문항 수를 분모로 쓴다 (푼 만큼만 평가한다).
    // 선생님이 채점한 건은 submittedCount 가 0이라 전체 문항 수를 쓴다
    const denom = d.result.submittedCount > 0 ? d.result.submittedCount : d.worksheet.problemCount
    bucket.add(d.result.correctProblems, denom)
  }

  return { current, past }
}

/**
 * 채점이 끝난 뒤 호출한다. 평균 정답률과 레벨을 다시 계산해 저장한다.
 * 저장 실패가 채점을 막지 않도록 호출부에서 감싸 쓴다(tryRecalcStudentLevel).
 */
export async function recalcStudentLevel(studentId: string): Promise<LevelSnapshot | null> {
  // 갱신 전 값을 먼저 읽어 둔다 — 덮어쓰고 나면 알 수 없다
  const before = await prisma.student.findUnique({
    where: { id: studentId },
    select: { currentLevel: true, avgCorrectRate: true },
  })
  if (!before) return null

  const { current, past } = await splitAverages(studentId)
  const avg = blendedRate(past.rate, current.rate)
  // 칭호 상한은 지금까지 푼 전체 문제 수로 정해진다
  const totalProblems = current.total + past.total
  const info = levelInfoOf(avg, totalProblems)
  const rounded = avg === null ? null : Math.round(avg * 10) / 10

  await prisma.student.update({
    where: { id: studentId },
    data: { avgCorrectRate: rounded, currentLevel: info.level },
  })

  const r1 = (v: number | null) => (v === null ? null : Math.round(v * 10) / 10)

  return {
    avgCorrectRate: rounded,
    level: info.level,
    grade: info.grade,
    title: info.title,
    unranked: info.unranked,
    capped: info.capped,
    capLevel: info.capLevel,
    currentRate: r1(current.rate),
    pastRate: r1(past.rate),
    totalProblems,
    levelBefore: before.currentLevel ?? null,
    avgRateBefore: before.avgCorrectRate ?? null,
  }
}

/** 채점 응답을 막지 않는 버전 */
export async function tryRecalcStudentLevel(studentId: string): Promise<LevelSnapshot | null> {
  try {
    return await recalcStudentLevel(studentId)
  } catch (e) {
    console.error('[studentLevel]', e)
    return null
  }
}
