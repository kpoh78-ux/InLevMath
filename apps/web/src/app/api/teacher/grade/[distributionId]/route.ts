import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { STEP_ABILITY_WEIGHT, WorksheetStep } from '@inlevmath/shared'
import { academyTeacher } from '@/lib/academy'
import { tryApplyAutoReward } from '@/lib/autoReward'
import { tryRecalcStudentLevel } from '@/lib/studentLevel'

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
  const { wrongProblems, markedProblems } = await req.json() as {
    wrongProblems: number[]
    /** 선생님이 판정을 내린 문제 번호. 안 보내면 전체를 판정한 것으로 본다 */
    markedProblems?: number[]
  }

  const teacher = await academyTeacher(auth.sub)
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
  const judged = Array.isArray(markedProblems)
    ? markedProblems.filter(n => n >= 1 && n <= total).length
    : total
  const correctProblems = Math.max(0, judged - wrongCount)
  const rate = judged > 0 ? correctProblems / judged : 0
  const step = dist.worksheet.step as WorksheetStep

  // 능력치 델타
  const weights = STEP_ABILITY_WEIGHT[step] ?? {}
  const gain = rate * 8
  const dComp = (weights.comprehension ?? 0) * gain
  const dReas = (weights.reasoning ?? 0) * gain
  const dCalc = (weights.calculation ?? 0) * gain

  const wrongProblemsJson = JSON.stringify(wrongProblems.filter(n => n >= 1 && n <= total).sort((a, b) => a - b))

  // 선생님이 판정한 문항 수 — 정답률·레벨의 분모가 된다 (판정한 만큼만 평가)
  const markedCount = Array.isArray(markedProblems)
    ? markedProblems.filter(n => n >= 1 && n <= total).length
    : total

  const [result, updatedStudent] = await prisma.$transaction([
    prisma.worksheetResult.upsert({
      where: { distributionId },
      // 선생님이 판정을 내렸으므로 보류(pending)는 비운다
      create: {
        distributionId, correctProblems, wrongProblemsJson,
        gradedBy: 'teacher', pendingProblemsJson: '[]', submittedCount: markedCount,
      },
      update: {
        correctProblems, wrongProblemsJson,
        gradedBy: 'teacher', pendingProblemsJson: '[]', submittedCount: markedCount,
      },
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

  // 정답률에 따른 자동 보상 (규칙이 없으면 아무 일도 없다)
  // 평균 정답률이 바뀌었으니 레벨·칭호를 다시 계산한다
  const level = await tryRecalcStudentLevel(dist.student.id)

  const autoReward = await tryApplyAutoReward({
    teacherId: teacher.id,
    studentId: dist.student.id,
    sourceType: 'worksheet',
    sourceId: distributionId,
    correctRate: Math.round(rate * 100),
  })

  return NextResponse.json({
    correctProblems: result.correctProblems,
    totalProblems: total,
    correctRate: Math.round(rate * 100),
    autoReward,
    level,
    wrongProblems: JSON.parse(result.wrongProblemsJson),
    abilityDelta: { comprehension: dComp, reasoning: dReas, calculation: dCalc },
    newAbility: {
      comprehension: updatedStudent.comprehension,
      reasoning: updatedStudent.reasoning,
      calculation: updatedStudent.calculation,
    },
  })
}
