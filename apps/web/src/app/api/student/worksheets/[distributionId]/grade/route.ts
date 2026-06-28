import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyToken } from '@/lib/auth'
import { STEP_ABILITY_WEIGHT, STEP_CLEAR_THRESHOLD, WorksheetStep } from '@inlevmath/shared'

// POST /api/student/worksheets/[distributionId]/grade — 채점 제출 + 능력치 반영
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ distributionId: string }> }
) {
  const auth = req.headers.get('authorization')?.split(' ')[1]
  if (!auth) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  const payload = await verifyToken(auth)
  if (!payload || payload.role !== 'student') return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const { distributionId } = await params
  const { correctProblems } = await req.json()

  const student = await prisma.student.findFirst({ where: { userId: payload.sub } })
  if (!student) return NextResponse.json({ error: '학생 정보 없음' }, { status: 404 })

  const dist = await prisma.worksheetDistribution.findFirst({
    where: { id: distributionId, studentId: student.id },
    include: { worksheet: true, result: true },
  })
  if (!dist) return NextResponse.json({ error: '배포 기록 없음' }, { status: 404 })
  if (dist.result) return NextResponse.json({ error: '이미 채점이 제출되었습니다.' }, { status: 400 })

  const total = dist.worksheet.problemCount
  const correct = Math.max(0, Math.min(correctProblems, total))
  const rate = total > 0 ? correct / total : 0
  const step = dist.worksheet.step as WorksheetStep

  // 능력치 델타 계산
  const weights = STEP_ABILITY_WEIGHT[step] ?? {}
  const gain = rate * 8  // 최대 8점 증가 (정답률 100% 기준)
  const dComp = (weights.comprehension ?? 0) * gain
  const dReas = (weights.reasoning ?? 0) * gain
  const dCalc = (weights.calculation ?? 0) * gain

  // 트랜잭션: 결과 저장 + 능력치 업데이트 + 상태 갱신
  const [result, updatedStudent] = await prisma.$transaction([
    prisma.worksheetResult.create({
      data: { distributionId, correctProblems: correct },
    }),
    prisma.student.update({
      where: { id: student.id },
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

  const correctRate = Math.round(rate * 100)
  const cleared = correctRate >= STEP_CLEAR_THRESHOLD[step]

  return NextResponse.json({
    correctProblems: correct,
    totalProblems: total,
    correctRate,
    cleared,
    abilityDelta: { comprehension: dComp, reasoning: dReas, calculation: dCalc },
    newAbility: {
      comprehension: updatedStudent.comprehension,
      reasoning:     updatedStudent.reasoning,
      calculation:   updatedStudent.calculation,
    },
  })
}
