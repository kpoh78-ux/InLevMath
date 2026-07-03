import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/db'

function parseWrong(json: string): number[] {
  try { return JSON.parse(json) } catch { return [] }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser(req)
  if (!auth || auth.role !== 'teacher') {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }
  const { id } = await params
  const teacher = await prisma.teacher.findUnique({ where: { userId: auth.sub } })
  if (!teacher) return NextResponse.json({ error: '선생님 정보를 찾을 수 없습니다.' }, { status: 404 })

  const student = await prisma.student.findFirst({
    where: { id, teacherId: teacher.id },
    include: { user: { select: { name: true } } },
  })
  if (!student) return NextResponse.json({ error: '학생을 찾을 수 없습니다.' }, { status: 404 })

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  // 최근 30일 학습지 채점 결과
  const worksheetResults = await prisma.worksheetResult.findMany({
    where: {
      distribution: { studentId: id },
      submittedAt: { gte: thirtyDaysAgo },
    },
    include: {
      distribution: {
        include: { worksheet: { select: { step: true, problemCount: true } } },
      },
    },
    orderBy: { submittedAt: 'asc' },
  })

  // 최근 30일 교재 채점 결과
  const textbookResults = await prisma.textbookResult.findMany({
    where: {
      studentId: id,
      submittedAt: { gte: thirtyDaysAgo },
    },
    include: {
      textbook: { include: { problems: { select: { id: true } } } },
    },
    orderBy: { submittedAt: 'asc' },
  })

  // ── 전체 요약 ─────────────────────────────────────────────────
  let totalProblems = 0
  let correctProblems = 0

  for (const r of worksheetResults) {
    const total = r.distribution.worksheet.problemCount
    const wrong = parseWrong(r.wrongProblemsJson).length
    totalProblems += total
    correctProblems += total - wrong
  }
  for (const r of textbookResults) {
    const total = r.textbook.problems.length
    const wrong = parseWrong(r.wrongProblemsJson).length
    totalProblems += total
    correctProblems += total - wrong
  }

  // ── 주간 추이 (최근 4주, 가장 오래된 것 → 최신) ───────────────
  const now = Date.now()
  const weeklyTrend = Array.from({ length: 4 }, (_, i) => {
    const weekEnd   = new Date(now - i * 7 * 24 * 60 * 60 * 1000)
    const weekStart = new Date(now - (i + 1) * 7 * 24 * 60 * 60 * 1000)
    const label = i === 0 ? '이번주' : `${i + 1}주 전`

    let wTotal = 0; let wCorrect = 0

    for (const r of worksheetResults) {
      const d = new Date(r.submittedAt)
      if (d >= weekStart && d < weekEnd) {
        const total = r.distribution.worksheet.problemCount
        const wrong = parseWrong(r.wrongProblemsJson).length
        wTotal += total; wCorrect += total - wrong
      }
    }
    for (const r of textbookResults) {
      const d = new Date(r.submittedAt)
      if (d >= weekStart && d < weekEnd) {
        const total = r.textbook.problems.length
        const wrong = parseWrong(r.wrongProblemsJson).length
        wTotal += total; wCorrect += total - wrong
      }
    }

    return {
      label,
      problems: wTotal,
      correctRate: wTotal > 0 ? Math.round((wCorrect / wTotal) * 100) : null,
    }
  }).reverse()

  // ── 단계별 정답률 ──────────────────────────────────────────────
  const stepMap: Record<string, { total: number; correct: number }> = {}
  for (const r of worksheetResults) {
    const step = r.distribution.worksheet.step
    const total = r.distribution.worksheet.problemCount
    const wrong = parseWrong(r.wrongProblemsJson).length
    if (!stepMap[step]) stepMap[step] = { total: 0, correct: 0 }
    stepMap[step].total += total
    stepMap[step].correct += total - wrong
  }
  if (textbookResults.length > 0) {
    let tbTotal = 0; let tbCorrect = 0
    for (const r of textbookResults) {
      const total = r.textbook.problems.length
      const wrong = parseWrong(r.wrongProblemsJson).length
      tbTotal += total; tbCorrect += total - wrong
    }
    stepMap['교재'] = { total: tbTotal, correct: tbCorrect }
  }

  const STEP_ORDER = ['기초', '기본', '발전', '최상위', '최다빈출', '최다오답', '서술형', '모의고사', '교재']
  const byStep = STEP_ORDER
    .filter(s => stepMap[s])
    .map(s => ({
      step: s,
      total: stepMap[s].total,
      correct: stepMap[s].correct,
      rate: Math.round((stepMap[s].correct / stepMap[s].total) * 100),
    }))

  return NextResponse.json({
    student: {
      id: student.id,
      name: student.user.name,
      grade: student.grade,
      currentLevel: student.currentLevel,
      currentMission: student.currentMission,
      comprehension: student.comprehension,
      reasoning: student.reasoning,
      calculation: student.calculation,
    },
    summary: {
      totalProblems,
      correctProblems,
      avgCorrectRate: totalProblems > 0 ? Math.round((correctProblems / totalProblems) * 100) : 0,
      worksheetCount: worksheetResults.length,
      textbookCount: textbookResults.length,
    },
    weeklyTrend,
    byStep,
  })
}
