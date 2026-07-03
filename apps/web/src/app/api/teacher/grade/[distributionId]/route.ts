import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { STEP_ABILITY_WEIGHT, WorksheetStep } from '@inlevmath/shared'

// POST /api/teacher/grade/[distributionId] — 선생님이 학생 학습지를 O/X 채점
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ distributionId: string }> }
) {
  const auth = await getAuthUser(req)
  if (!auth || auth.role !== 'teacher') {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  const { distributionId } = await params
  const { wrongProblems } = await req.json() as { wrongProblems: number[] }

  const teacher = await prisma.teacher.findUnique({ where: { userId: auth.sub } })
  if (!teacher) return NextResponse.json({ error: '선생님 정보를 찾을 수 없습니다.' }, { status: 404 })

  const dist = await prisma.worksheetDistribution.findFirst({
    where: { id: distributionId },
    include: {
      worksheet: true,
      student: { select: { id: true, teacherId: true, comprehension: true, reasoning: true, calculation: true } },
    },
  })
  if (!dist) return NextResponse.json({ error: '배포 기록을 찾을 수 없습니다.' }, { status: 404 })
  if (dist.student.teacherId !== teacher.id) {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
  }

  const total = dist.worksheet.problemCount
  const wrongCount = wrongProblems.filter(n => n >= 1 && n <= total).length
  const correctProblems = total - wrongCount
  const rate = total > 0 ? correctProblems / total : 0
  const step = dist.worksheet.step as WorksheetStep

  // 능력치 델타
  const weights = STEP_ABILITY_WEIGHT[step] ?? {}
  const gain = rate * 8
  const dComp = (weights.comprehension ?? 0) * gain
  const dReas = (weights.reasoning ?? 0) * gain
  const dCalc = (weights.calculation ?? 0) * gain

  const wrongProblemsJson = JSON.stringify(wrongProblems.filter(n => n >= 1 && n <= total).sort((a, b) => a - b))

  const [result, updatedStudent] = await prisma.$transaction([
    prisma.worksheetResult.upsert({
      where: { distributionId },
      create: { distributionId, correctProblems, wrongProblemsJson, gradedBy: 'teacher' },
      update: { correctProblems, wrongProblemsJson, gradedBy: 'teacher' },
    }),
    prisma.student.update({
      where: { id: dist.student.id },
      data: {
        comprehension: { increment: dComp },
        reasoning:     { increment: dReas },
        calculation:   { increment: dCalc },
      },
    }),
    prisma.worksheetDistribution.update({
      where: { id: distributionId },
      data: { status: 'graded' },
    }),
  ])

  return NextResponse.json({
    correctProblems: result.correctProblems,
    totalProblems: total,
    correctRate: Math.round(rate * 100),
    wrongProblems: JSON.parse(result.wrongProblemsJson),
    abilityDelta: { comprehension: dComp, reasoning: dReas, calculation: dCalc },
    newAbility: {
      comprehension: updatedStudent.comprehension,
      reasoning: updatedStudent.reasoning,
      calculation: updatedStudent.calculation,
    },
  })
}
