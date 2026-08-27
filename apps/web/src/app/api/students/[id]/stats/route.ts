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

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser(req)
  if (!auth || auth.role !== 'teacher') {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }
  const { id } = await params
  const teacher = await academyTeacher(auth.sub)
  if (!teacher) return NextResponse.json({ error: '선생님 정보를 찾을 수 없습니다.' }, { status: 404 })

  const student = await prisma.student.findFirst({
    where: { id, teacherId: teacher.id },
    include: { user: { select: { name: true } } },
  })
  if (!student) return NextResponse.json({ error: '학생을 찾을 수 없습니다.' }, { status: 404 })

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  // 1. 배정된 교재 목록 및 문제 수 초고속 집계 (DB 엔진 COUNT(*))
  const studentTextbooks = await prisma.textbookAssignment.findMany({
    where: { studentId: id },
    select: {
      id: true,
      completedAt: true,
      textbook: {
        select: {
          id: true,
          title: true,
          grade: true,
          _count: {
            select: { problems: true }
          }
        }
      }
    }
  })

  // 총 배정 문제 수 초고속 연산 (메모리 사용량 최소화)
  const totalAssignedProblemCount = studentTextbooks.reduce(
    (acc, item) => acc + (item.textbook._count.problems || 0),
    0
  )

  // 2. 최근 30일 학습지 채점 결과
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

  // 2-1. 숙제 — 선생님이 숙제로 지정한 배포 중 아직 채점하지 않은 것.
  //      집에서 풀어와 다음 시간에 확인해야 하는 것들이라 기간 제한을 두지 않는다.
  const homeworkDistributions = await prisma.worksheetDistribution.findMany({
    where: {
      studentId: id,
      homeworkAt: { not: null },
      status: { not: 'graded' },
      hiddenAt: null,
    },
    select: {
      id: true,
      status: true,
      distributedAt: true,
      homeworkAt: true,
      worksheet: { select: { title: true, step: true, unit: true, problemCount: true } },
    },
    orderBy: { distributedAt: 'desc' },
    take: 20,
  })

  // 3. 최근 30일 교재 채점 결과 (COUNT 집계로 메모리/트래픽 절감)
  const textbookResults = await prisma.textbookResult.findMany({
    where: {
      studentId: id,
      submittedAt: { gte: thirtyDaysAgo },
    },
    include: {
      textbook: { select: { _count: { select: { problems: true } } } },
    },
    orderBy: { submittedAt: 'asc' },
  })

  // ── 사전 파싱 (루프 밖에서 1회만 실행) ────────────────────────
  const wsComputed = worksheetResults.map(r => ({
    r,
    date: new Date(r.submittedAt),
    total: r.distribution.worksheet.problemCount,
    wrongCount: parseWrong(r.wrongProblemsJson).length,
  }))
  const tbComputed = textbookResults.map(r => ({
    r,
    date: new Date(r.submittedAt),
    total: r.textbook._count.problems,
    wrongCount: parseWrong(r.wrongProblemsJson).length,
  }))

  // ── 전체 요약 ─────────────────────────────────────────────────
  let totalProblems = 0
  let correctProblems = 0

  for (const { total, wrongCount } of wsComputed) {
    totalProblems += total
    correctProblems += total - wrongCount
  }
  for (const { total, wrongCount } of tbComputed) {
    totalProblems += total
    correctProblems += total - wrongCount
  }

  // ── 주간 추이 (최근 4주, 가장 오래된 것 → 최신) ───────────────
  const now = Date.now()
  const weeklyTrend = Array.from({ length: 4 }, (_, i) => {
    const weekEnd   = new Date(now - i * 7 * 24 * 60 * 60 * 1000)
    const weekStart = new Date(now - (i + 1) * 7 * 24 * 60 * 60 * 1000)
    const label = i === 0 ? '이번주' : `${i + 1}주 전`

    let wTotal = 0; let wCorrect = 0

    for (const { date, total, wrongCount } of wsComputed) {
      if (date >= weekStart && date < weekEnd) {
        wTotal += total; wCorrect += total - wrongCount
      }
    }
    for (const { date, total, wrongCount } of tbComputed) {
      if (date >= weekStart && date < weekEnd) {
        wTotal += total; wCorrect += total - wrongCount
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
  for (const { r, total, wrongCount } of wsComputed) {
    const step = r.distribution.worksheet.step
    if (!stepMap[step]) stepMap[step] = { total: 0, correct: 0 }
    stepMap[step].total += total
    stepMap[step].correct += total - wrongCount
  }
  if (tbComputed.length > 0) {
    let tbTotal = 0; let tbCorrect = 0
    for (const { total, wrongCount } of tbComputed) {
      tbTotal += total; tbCorrect += total - wrongCount
    }
    stepMap['교재'] = { total: tbTotal, correct: tbCorrect }
  }

  const STEP_ORDER = ['기초', '기본', '발전', '최상위', '취약유형', '오답유형', '단원평가', '최다빈출', '최다오답', '서술형', '모의고사', '기출문제', '교재']
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
      levelRate: student.avgCorrectRate,
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
      assignedTextbookCount: studentTextbooks.length,
      totalAssignedProblemCount,
      totalProblemCount: totalAssignedProblemCount,
    },
    assignedTextbooks: studentTextbooks.map(item => ({
      assignmentId: item.id,
      textbookId: item.textbook.id,
      title: item.textbook.title,
      grade: item.textbook.grade,
      problemCount: item.textbook._count.problems,
      isCompleted: Boolean(item.completedAt),
    })),
    homework: homeworkDistributions.map(d => ({
      id: d.id,
      title: d.worksheet.title,
      step: d.worksheet.step,
      unit: d.worksheet.unit,
      problemCount: d.worksheet.problemCount,
      status: d.status,
      distributedAt: d.distributedAt,
      homeworkAt: d.homeworkAt,
    })),
    weeklyTrend,
    byStep,
  })
}
