import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { academyTeacher } from '@/lib/academy'

function parseWrong(json: string): number[] {
  try { return JSON.parse(json) } catch { return [] }
}

// GET /api/students/[id]/lesson-history
// 최근 3회 수업 기록 + 최근 3개월 월별 정답률 추이
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser(req)
  if (!auth || auth.role !== 'teacher') return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { id } = await params
  const teacher = await academyTeacher(auth.sub)
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

  // ── 사전 파싱 (루프 바깥에서 1회만) ───────────────────────────────────────
  // 3개월 월별 루프에서마다 JSON.parse와 new Date를 반복하지 않도록 미리 계산
  const wsComputed = wsResults.map(r => ({
    r,
    date: new Date(r.submittedAt),
    total: r.distribution.worksheet.problemCount,
    wrongArr: parseWrong(r.wrongProblemsJson),
    get wrongCount() { return this.wrongArr.length },
  }))
  const tbComputed = tbResults.map(r => ({
    r,
    date: new Date(r.submittedAt),
    total: r.textbook._count.problems,
    wrongArr: parseWrong(r.wrongProblemsJson),
    get wrongCount() { return this.wrongArr.length },
  }))

  // ── 최근 3회 수업 기록 ─────────────────────────────────────────────
  type Session = {
    type: 'worksheet' | 'textbook'
    title: string; grade: string; step?: string; unit?: string
    totalProblems: number; correctProblems: number; correctRate: number
    gradedAt: string
  }

  const allSessions: Session[] = [
    ...wsComputed.map(({ r, total, wrongCount }) => {
      const correct = total - wrongCount
      return {
        type: 'worksheet' as const,
        title: r.distribution.worksheet.title,
        grade: r.distribution.worksheet.grade,
        step:  r.distribution.worksheet.step,
        unit:  r.distribution.worksheet.unit,
        totalProblems: total,
        correctProblems: correct,
        correctRate: total > 0 ? Math.round((correct / total) * 100) : 0,
        gradedAt: r.submittedAt.toISOString(),
      }
    }),
    ...tbComputed.map(({ r, total, wrongCount }) => {
      const correct = total - wrongCount
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

  // ── 3개월 월별 정답률 추이 ──────────────────────────────────────────
  const now = new Date()
  const monthlyTrend = Array.from({ length: 3 }, (_, i) => {
    const target = new Date(now.getFullYear(), now.getMonth() - (2 - i), 1)
    const monthStart = new Date(target.getFullYear(), target.getMonth(), 1)
    const monthEnd   = new Date(target.getFullYear(), target.getMonth() + 1, 1)
    const label = `${target.getMonth() + 1}월`

    let total = 0; let correct = 0

    // 사전 파싱된 값 재활용 — JSON.parse와 Date 생성 추가 없음
    for (const { date, total: t, wrongCount } of wsComputed) {
      if (date >= monthStart && date < monthEnd) {
        total += t; correct += t - wrongCount
      }
    }
    for (const { date, total: t, wrongCount } of tbComputed) {
      if (date >= monthStart && date < monthEnd) {
        total += t; correct += t - wrongCount
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

  // ── 교재별 채점 범위 ─────────────────────────────────────────────────────────
  // TextbookResult는 오답 번호만 갖고 있으므로, 그 번호들이 속한
  // 교재 페이지 구간을 함께 계산해 "어디까지 풀었는지"를 보여준다.
  // wrongArr는 사전 파싱 시 이미 계산해 둔 값을 재활용 — JSON.parse 추가 없음
  const textbookRanges = await Promise.all(
    tbComputed.slice(0, 5).map(async ({ r, total, wrongArr }) => {
      const correct = Math.max(total - wrongArr.length, 0)

      // 오답이 속한 페이지 구간 (오답이 없으면 생략)
      let pageFrom: number | null = null
      let pageTo: number | null = null
      if (wrongArr.length > 0) {
        const agg = await prisma.textbookProblem.aggregate({
          where: { textbookId: r.textbookId, number: { in: wrongArr }, bookPage: { gt: 0 } },
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
        wrongCount: wrongArr.length,
        wrongFrom: wrongArr.length > 0 ? Math.min(...wrongArr) : null,
        wrongTo: wrongArr.length > 0 ? Math.max(...wrongArr) : null,
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
