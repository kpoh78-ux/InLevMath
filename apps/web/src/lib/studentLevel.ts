// 학생 레벨·칭호 계산 (Lv.1 ~ Lv.9)
//
// 레벨은 평균 정답률 하나로 정해진다. 등급표와 칭호는 packages/shared 에 있다.
//
// 최근 학습에 무게를 둔다.
//   현재 과정 (70%) — 지금 진도를 나가는 교재 + 최근 90일 안에 푼 학습지
//   지난 과정 (30%) — 끝낸 교재 + 90일이 지난 학습지
//
// 교재를 끝내면(TextbookAssignment.completedAt) 그 교재 성적은 30% 쪽으로 옮겨간다.
// 학습지는 채점일이 90일을 넘기면 자동으로 30% 쪽으로 넘어간다.
// 한쪽 기록이 없으면 있는 쪽만 그대로 쓴다.
//
// 푼 문제 수가 적으면 칭호에 상한이 걸린다 (TITLE_CAPS).
// 300문제 미만은 비긴너, 600문제 미만은 스텐다드, 900문제 미만은 마스터까지다.
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

  // ── 교재 — 끝냈으면 지난 과정, 진도 중이면 현재 과정 ──
  const tResults = await prisma.textbookResult.findMany({
    where: { studentId },
    select: { textbookId: true, wrongProblemsJson: true },
  })

  if (tResults.length > 0) {
    const ids = [...new Set(tResults.map(r => r.textbookId))]

    // 문제 수는 개수만 센다 (3000문제 교재를 통째로 읽지 않는다)
    const groups = await prisma.textbookProblem.groupBy({
      by: ['textbookId'],
      where: { textbookId: { in: ids } },
      _count: { _all: true },
    })
    const countOf = new Map(groups.map(g => [g.textbookId, g._count._all]))

    const assignments = await prisma.textbookAssignment.findMany({
      where: { studentId, textbookId: { in: ids } },
      select: { textbookId: true, completedAt: true },
    })
    const completed = new Set(
      assignments.filter(a => a.completedAt !== null).map(a => a.textbookId)
    )

    for (const r of tResults) {
      const n = countOf.get(r.textbookId) ?? 0
      if (n === 0) continue
      let wrong = 0
      try {
        const arr = JSON.parse(r.wrongProblemsJson) as number[]
        wrong = Array.isArray(arr) ? arr.filter(v => v >= 1 && v <= n).length : 0
      } catch { /* 손상된 값은 틀린 문제 0개로 본다 */ }

      // 배정 기록이 없는 교재는 아직 진도 중인 것으로 본다
      const bucket = completed.has(r.textbookId) ? past : current
      bucket.add(n - wrong, n)
    }
  }

  return { current, past }
}

/**
 * 채점이 끝난 뒤 호출한다. 평균 정답률과 레벨을 다시 계산해 저장한다.
 * 저장 실패가 채점을 막지 않도록 호출부에서 감싸 쓴다(tryRecalcStudentLevel).
 */
export async function recalcStudentLevel(studentId: string): Promise<LevelSnapshot | null> {
  const exists = await prisma.student.findUnique({
    where: { id: studentId }, select: { id: true },
  })
  if (!exists) return null

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
