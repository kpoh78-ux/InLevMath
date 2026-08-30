import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { academyTeacher } from '@/lib/academy'

function parseWrong(json: string | null | undefined): number[] {
  if (!json) return []
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
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

  // ── 사전 파싱 (루프 바깥에서 1회만) ───────────────────────────────────────
  // 3개월 월별 루프에서마다 JSON.parse와 new Date를 반복하지 않도록 미리 계산
  const wsComputed = wsResults.map(r => ({
    r,
    date: new Date(r.submittedAt),
    total: r.distribution.worksheet.problemCount,
    wrongArr: parseWrong(r.wrongProblemsJson),
    get wrongCount() { return this.wrongArr.length },
  }))

  // ── 최근 3회 수업 기록 ─────────────────────────────────────────────
  type Session = {
    type: 'worksheet'
    title: string; grade: string; step?: string; unit?: string
    totalProblems: number; correctProblems: number; correctRate: number
    gradedAt: string
  }

  const allSessions: Session[] = wsComputed.map(({ r, total, wrongCount }) => {
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
  })
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
      id: true, status: true, distributedAt: true, homeworkAt: true,
      worksheet: { select: { title: true, step: true, unit: true, problemCount: true } },
      result: { select: { correctProblems: true, submittedAt: true, gradedBy: true } },
    },
  })

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
      homeworkAt: d.homeworkAt,
      graded: d.result !== null,
      correctProblems: d.result?.correctProblems ?? null,
      correctRate: d.result
        ? Math.round((d.result.correctProblems / d.worksheet.problemCount) * 100)
        : null,
      gradedBy: d.result?.gradedBy ?? null,
      submittedAt: d.result?.submittedAt ?? null,
    })),
  })
}
