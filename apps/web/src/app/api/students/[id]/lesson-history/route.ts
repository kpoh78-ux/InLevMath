import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/db'

function parseWrong(json: string): number[] {
  try { return JSON.parse(json) } catch { return [] }
}

// GET /api/students/[id]/lesson-history
// 최근 3회 수업 기록 + 최근 3개월 월별 정답률 추이
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser(req)
  if (!auth || auth.role !== 'teacher') return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { id } = await params
  const teacher = await prisma.teacher.findUnique({ where: { userId: auth.sub } })
  if (!teacher) return NextResponse.json({ error: '선생님 정보 없음' }, { status: 404 })

  const student = await prisma.student.findFirst({
    where: { id, teacherId: teacher.id },
    include: { user: { select: { name: true } } },
  })
  if (!student) return NextResponse.json({ error: '학생 없음' }, { status: 404 })

  const threeMonthsAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)

  // 최근 3개월 학습지 채점 결과 전체
  const wsResults = await prisma.worksheetResult.findMany({
    where: {
      distribution: { studentId: id },
      submittedAt: { gte: threeMonthsAgo },
    },
    include: {
      distribution: {
        include: {
          worksheet: { select: { title: true, step: true, unit: true, problemCount: true, grade: true } },
        },
      },
    },
    orderBy: { submittedAt: 'desc' },
  })

  // 최근 3개월 교재 채점 결과 전체
  const tbResults = await prisma.textbookResult.findMany({
    where: { studentId: id, submittedAt: { gte: threeMonthsAgo } },
    include: {
      textbook: {
        select: { title: true, grade: true, publisher: true, _count: { select: { problems: true } } },
      },
    },
    orderBy: { submittedAt: 'desc' },
  })

  // ── 최근 3회 수업 기록 ─────────────────────────────────────────
  type Session = {
    type: 'worksheet' | 'textbook'
    title: string; grade: string; step?: string; unit?: string
    totalProblems: number; correctProblems: number; correctRate: number
    gradedAt: string
  }

  const allSessions: Session[] = [
    ...wsResults.map(r => {
      const total = r.distribution.worksheet.problemCount
      const wrong = parseWrong(r.wrongProblemsJson).length
      const correct = total - wrong
      return {
        type: 'worksheet' as const,
        title: r.distribution.worksheet.title,
        grade: r.distribution.worksheet.grade,
        step:  r.distribution.worksheet.step,
        unit:  r.distribution.worksheet.unit,
        totalProblems: total,
        correctProblems: correct,
        correctRate: Math.round((correct / total) * 100),
        gradedAt: r.submittedAt.toISOString(),
      }
    }),
    ...tbResults.map(r => {
      const total = r.textbook._count.problems
      const wrong = parseWrong(r.wrongProblemsJson).length
      const correct = total - wrong
      return {
        type: 'textbook' as const,
        title: r.textbook.title,
        grade: r.textbook.grade,
        totalProblems: total,
        correctProblems: correct,
        correctRate: total > 0 ? Math.round((correct / total) * 100) : 0,
        gradedAt: r.submittedAt.toISOString(),
      }
    }),
  ]
  // 날짜 내림차순 정렬, 최근 3개만
  allSessions.sort((a, b) => new Date(b.gradedAt).getTime() - new Date(a.gradedAt).getTime())
  const recentSessions = allSessions.slice(0, 3)

  // ── 3개월 월별 정답률 추이 ────────────────────────────────────
  const now = new Date()
  const monthlyTrend = Array.from({ length: 3 }, (_, i) => {
    const target = new Date(now.getFullYear(), now.getMonth() - (2 - i), 1)
    const monthStart = new Date(target.getFullYear(), target.getMonth(), 1)
    const monthEnd   = new Date(target.getFullYear(), target.getMonth() + 1, 1)
    const label = `${target.getMonth() + 1}월`

    let total = 0; let correct = 0

    for (const r of wsResults) {
      const d = new Date(r.submittedAt)
      if (d >= monthStart && d < monthEnd) {
        const t = r.distribution.worksheet.problemCount
        const c = t - parseWrong(r.wrongProblemsJson).length
        total += t; correct += c
      }
    }
    for (const r of tbResults) {
      const d = new Date(r.submittedAt)
      if (d >= monthStart && d < monthEnd) {
        const t = r.textbook._count.problems
        const c = t - parseWrong(r.wrongProblemsJson).length
        total += t; correct += c
      }
    }
    return {
      label,
      problems: total,
      correctRate: total > 0 ? Math.round((correct / total) * 100) : null,
    }
  })

  // ── 배포된 학습지 현황 (채점 여부 포함) ──
  const distributions = await prisma.worksheetDistribution.findMany({
    where: { studentId: student.id },
    orderBy: { distributedAt: 'desc' },
    take: 10,
    select: {
      id: true, status: true, distributedAt: true,
      worksheet: { select: { title: true, step: true, unit: true, problemCount: true } },
      result: { select: { correctProblems: true, submittedAt: true, gradedBy: true } },
    },
  })

  // ── 교재별 채점 범위 ──
  // TextbookResult는 오답 번호만 갖고 있으므로, 그 번호들이 속한
  // 교재 페이지 구간을 함께 계산해 "어디까지 풀었는지"를 보여준다.
  const textbookRanges = await Promise.all(
    tbResults.slice(0, 5).map(async r => {
      let wrong: number[] = []
      try { wrong = JSON.parse(r.wrongProblemsJson) } catch { /* 손상된 값 무시 */ }

      const total = r.textbook._count.problems
      const correct = Math.max(total - wrong.length, 0)

      // 오답이 속한 페이지 구간 (오답이 없으면 생략)
      let pageFrom: number | null = null
      let pageTo: number | null = null
      if (wrong.length > 0) {
        const agg = await prisma.textbookProblem.aggregate({
          where: { textbookId: r.textbookId, number: { in: wrong }, bookPage: { gt: 0 } },
          _min: { bookPage: true },
          _max: { bookPage: true },
        })
        pageFrom = agg._min.bookPage ?? null
        pageTo = agg._max.bookPage ?? null
      }

      return {
        textbookId: r.textbookId,
        title: r.textbook.title,
        publisher: r.textbook.publisher,
        totalProblems: total,
        correctProblems: correct,
        correctRate: total > 0 ? Math.round((correct / total) * 100) : 0,
        wrongCount: wrong.length,
        wrongFrom: wrong.length > 0 ? Math.min(...wrong) : null,
        wrongTo: wrong.length > 0 ? Math.max(...wrong) : null,
        pageFrom,
        pageTo,
        submittedAt: r.submittedAt,
      }
    })
  )

  return NextResponse.json({
    student: {
      id: student.id,
      name: student.user.name,
      grade: student.grade,
      currentLevel: student.currentLevel,
      comprehension: student.comprehension,
      reasoning: student.reasoning,
      calculation: student.calculation,
    },
    recentSessions,
    monthlyTrend,
    distributions: distributions.map(d => ({
      id: d.id,
      title: d.worksheet.title,
      step: d.worksheet.step,
      unit: d.worksheet.unit,
      problemCount: d.worksheet.problemCount,
      status: d.status,
      distributedAt: d.distributedAt,
      graded: d.result !== null,
      correctProblems: d.result?.correctProblems ?? null,
      correctRate: d.result
        ? Math.round((d.result.correctProblems / d.worksheet.problemCount) * 100)
        : null,
      gradedBy: d.result?.gradedBy ?? null,
      submittedAt: d.result?.submittedAt ?? null,
    })),
    textbookRanges,
  })
}
