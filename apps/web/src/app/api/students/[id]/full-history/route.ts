import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/db'

function parseWrong(json: string): number[] {
  try { return JSON.parse(json) } catch { return [] }
}

const CLEAR_THRESHOLD: Record<string, number> = {
  '기초': 80, '기본': 75, '발전': 70, '최상위': 65,
  '최다빈출': 75, '최다오답': 70, '서술형': 60, '모의고사': 70,
}

// GET /api/students/[id]/full-history
// 학생 상세 뷰용 전체 학습 이력 (최근 50건) + 능력치 + 단계별 통계
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser(req)
  if (!auth || auth.role !== 'teacher') return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { id } = await params
  const teacher = await prisma.teacher.findUnique({ where: { userId: auth.sub } })
  if (!teacher) return NextResponse.json({ error: '선생님 정보 없음' }, { status: 404 })

  const student = await prisma.student.findFirst({
    where: { id, teacherId: teacher.id },
    include: { user: { select: { name: true, phone: true } } },
  })
  if (!student) return NextResponse.json({ error: '학생 없음' }, { status: 404 })

  const [wsResults, tbResults] = await Promise.all([
    prisma.worksheetResult.findMany({
      where: { distribution: { studentId: id } },
      include: {
        distribution: {
          include: {
            worksheet: { select: { title: true, step: true, unit: true, grade: true, problemCount: true } },
          },
        },
      },
      orderBy: { submittedAt: 'desc' },
      take: 50,
    }),
    prisma.textbookResult.findMany({
      where: { studentId: id },
      include: {
        textbook: { select: { title: true, grade: true, _count: { select: { problems: true } } } },
      },
      orderBy: { submittedAt: 'desc' },
      take: 50,
    }),
  ])

  const worksheetResults = wsResults.map(r => {
    const total = r.distribution.worksheet.problemCount
    const wrong = parseWrong(r.wrongProblemsJson).length
    const correct = total - wrong
    const rate = total > 0 ? Math.round((correct / total) * 100) : 0
    const threshold = CLEAR_THRESHOLD[r.distribution.worksheet.step] ?? 75
    return {
      id: r.id,
      date: r.submittedAt.toISOString().slice(0, 10),
      title: r.distribution.worksheet.title,
      step: r.distribution.worksheet.step,
      unit: r.distribution.worksheet.unit,
      grade: r.distribution.worksheet.grade,
      total, correct, rate,
      cleared: rate >= threshold,
    }
  })

  const textbookResults = tbResults.map(r => {
    const total = r.textbook._count.problems
    const wrong = parseWrong(r.wrongProblemsJson).length
    const correct = total - wrong
    const rate = total > 0 ? Math.round((correct / total) * 100) : 0
    return {
      id: r.id,
      date: r.submittedAt.toISOString().slice(0, 10),
      title: r.textbook.title,
      grade: r.textbook.grade,
      total, correct, rate,
    }
  })

  // 단계별 통계 (전체 기간)
  const stepMap: Record<string, { total: number; correct: number; count: number }> = {}
  for (const r of wsResults) {
    const step = r.distribution.worksheet.step
    const total = r.distribution.worksheet.problemCount
    const correct = total - parseWrong(r.wrongProblemsJson).length
    if (!stepMap[step]) stepMap[step] = { total: 0, correct: 0, count: 0 }
    stepMap[step].total += total
    stepMap[step].correct += correct
    stepMap[step].count++
  }
  const STEP_ORDER = ['기초', '기본', '발전', '최상위', '최다빈출', '최다오답', '서술형', '모의고사']
  const stepStats = STEP_ORDER.filter(s => stepMap[s]).map(s => ({
    step: s,
    rate: Math.round((stepMap[s].correct / stepMap[s].total) * 100),
    count: stepMap[s].count,
    cleared: stepMap[s].count > 0,
    threshold: CLEAR_THRESHOLD[s] ?? 75,
  }))

  // 최근 활동 요약
  const lastWsDate = wsResults[0]?.submittedAt.toISOString().slice(0, 10) ?? null
  const lastTbDate = tbResults[0]?.submittedAt.toISOString().slice(0, 10) ?? null
  const clearedCount = worksheetResults.filter(r => r.cleared).length

  return NextResponse.json({
    student: {
      id: student.id,
      name: student.user.name,
      phone: student.user.phone,
      school: student.school,
      grade: student.grade,
      currentLevel: student.currentLevel,
      currentMission: student.currentMission,
      comprehension: student.comprehension,
      reasoning: student.reasoning,
      calculation: student.calculation,
    },
    worksheetResults,
    textbookResults,
    stepStats,
    recentActivity: {
      lastDate: lastWsDate ?? lastTbDate,
      totalSessions: wsResults.length + tbResults.length,
      clearedCount,
    },
  })
}
