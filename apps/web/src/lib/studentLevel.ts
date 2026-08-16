// 학생 레벨·칭호 계산 (Lv.1 ~ Lv.9)
//
// 레벨은 평균 정답률 하나로 정해진다. 등급표와 칭호는 packages/shared 에 있다.
//
// 과정(학년·학기·교재)이 바뀌면 평균을 지우지 않는다.
//   · 바뀌는 순간의 평균을 carryRate 에 넣어 두고 courseStartedAt 을 지금으로 옮긴다
//   · 이후 평균 = carryRate * 30% + (새 과정 채점 평균) * 70%
//   · 새 과정에 채점이 아직 없으면 carryRate 를 그대로 쓴다
//
// 평균은 누적해서 더하지 않고 매번 채점 기록에서 다시 계산한다.
// 선생님이 같은 학습지를 다시 채점해도 두 번 반영되지 않는다.

import { prisma } from '@/lib/db'
import { blendedRate, levelInfoOf } from '@inlevmath/shared'

export type LevelSnapshot = {
  /** 반영된 평균 정답률(%). 채점 기록이 전혀 없으면 null */
  avgCorrectRate: number | null
  level: number
  grade: number
  title: string
  unranked: boolean
  /** 이번 과정만의 평균 (없으면 null) */
  courseRate: number | null
  carryRate: number | null
  totalProblems: number
}

/** 이번 과정의 채점 결과를 모아 평균 정답률(%)을 낸다 */
async function courseAverage(studentId: string, since: Date | null) {
  const when = since ? { gte: since } : undefined

  // 학습지 — 채점된 배포만
  const dists = await prisma.worksheetDistribution.findMany({
    where: {
      studentId,
      result: { is: when ? { submittedAt: when } : {} },
    },
    select: {
      worksheet: { select: { problemCount: true } },
      result: { select: { correctProblems: true } },
    },
  })

  let correct = 0
  let total = 0
  for (const d of dists) {
    if (!d.result) continue
    total += d.worksheet.problemCount
    correct += Math.max(0, Math.min(d.result.correctProblems, d.worksheet.problemCount))
  }

  // 교재 — 문제 수는 교재별로 세어 온다 (3000문제 교재를 통째로 읽지 않는다)
  const tResults = await prisma.textbookResult.findMany({
    where: { studentId, ...(when ? { submittedAt: when } : {}) },
    select: { textbookId: true, wrongProblemsJson: true },
  })

  if (tResults.length > 0) {
    const ids = [...new Set(tResults.map(r => r.textbookId))]
    const groups = await prisma.textbookProblem.groupBy({
      by: ['textbookId'],
      where: { textbookId: { in: ids } },
      _count: { _all: true },
    })
    const countOf = new Map(groups.map(g => [g.textbookId, g._count._all]))

    for (const r of tResults) {
      const n = countOf.get(r.textbookId) ?? 0
      if (n === 0) continue
      let wrong = 0
      try {
        const arr = JSON.parse(r.wrongProblemsJson) as number[]
        wrong = Array.isArray(arr) ? arr.filter(v => v >= 1 && v <= n).length : 0
      } catch { /* 손상된 값은 전부 맞은 것으로 보지 않고 0으로 둔다 */ }
      total += n
      correct += n - wrong
    }
  }

  return {
    rate: total > 0 ? (correct / total) * 100 : null,
    totalProblems: total,
  }
}

/**
 * 채점이 끝난 뒤 호출한다. 평균 정답률과 레벨을 다시 계산해 저장한다.
 * 저장 실패가 채점을 막지 않도록 호출부에서 감싸 쓴다(tryRecalcStudentLevel).
 */
export async function recalcStudentLevel(studentId: string): Promise<LevelSnapshot | null> {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { carryRate: true, courseStartedAt: true },
  })
  if (!student) return null

  const { rate: courseRate, totalProblems } = await courseAverage(studentId, student.courseStartedAt)
  const avg = blendedRate(student.carryRate, courseRate)
  const info = levelInfoOf(avg)

  await prisma.student.update({
    where: { id: studentId },
    data: {
      avgCorrectRate: avg === null ? null : Math.round(avg * 10) / 10,
      currentLevel: info.level,
    },
  })

  return {
    avgCorrectRate: avg === null ? null : Math.round(avg * 10) / 10,
    level: info.level,
    grade: info.grade,
    title: info.title,
    unranked: info.unranked,
    courseRate: courseRate === null ? null : Math.round(courseRate * 10) / 10,
    carryRate: student.carryRate,
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

/**
 * 과정 전환 — 지금까지의 평균을 30% 몫으로 넘기고 새 과정을 시작한다.
 * 학년이 바뀌면 자동으로, 학기·교재 교체는 선생님이 버튼으로 부른다.
 *
 * @param courseKey 새 과정 식별자 (보통 학생 학년)
 */
export async function rolloverCourse(studentId: string, courseKey: string) {
  // 끝나는 과정의 최종 평균을 먼저 확정한다
  const before = await recalcStudentLevel(studentId)

  await prisma.student.update({
    where: { id: studentId },
    data: {
      carryRate: before?.avgCorrectRate ?? null,
      courseStartedAt: new Date(),
      courseKey,
    },
  })

  // 새 과정엔 아직 채점이 없어 carryRate 가 그대로 평균이 된다
  return recalcStudentLevel(studentId)
}
