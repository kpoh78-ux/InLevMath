// POST /api/student/worksheets/[distributionId]/submit
//
// 학생이 OMR·수식 키패드로 낸 답을 받아 저장된 정답과 맞춰 1차 채점한다.
// body: { answers: string[] }  — 1번부터 순서대로
//
// 자동으로 판정하지 못한 문항(정답이 비었거나 이미지)은 pending 으로 남긴다.
// 선생님이 나중에 채점 화면에서 최종 판단한다.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyToken } from '@/lib/auth'
import {
  autoGrade, STEP_ABILITY_WEIGHT, STEP_CLEAR_THRESHOLD, WorksheetStep,
} from '@inlevmath/shared'
import { tryApplyAutoReward } from '@/lib/autoReward'
import { tryRecalcStudentLevel } from '@/lib/studentLevel'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ distributionId: string }> }
) {
  const token = req.headers.get('authorization')?.split(' ')[1]
  if (!token) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload || payload.role !== 'student') {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  }

  const student = await prisma.student.findFirst({ where: { userId: payload.sub } })
  if (!student) return NextResponse.json({ error: '학생 정보 없음' }, { status: 404 })

  const { distributionId } = await params
  const dist = await prisma.worksheetDistribution.findFirst({
    where: { id: distributionId, studentId: student.id },
    include: { worksheet: true, result: true },
  })
  if (!dist) return NextResponse.json({ error: '배포 기록 없음' }, { status: 404 })
  if (dist.result) {
    return NextResponse.json({ error: '이미 제출한 학습지입니다.' }, { status: 400 })
  }

  const body = await req.json().catch(() => ({})) as { answers?: unknown }
  if (!Array.isArray(body.answers)) {
    return NextResponse.json({ error: '답안을 확인해주세요.' }, { status: 400 })
  }

  const total = dist.worksheet.problemCount
  const studentAnswers = Array.from({ length: total }, (_, i) => {
    const v = body.answers as unknown[]
    return typeof v[i] === 'string' ? (v[i] as string).trim().slice(0, 200) : ''
  })

  let correctAnswers: string[] = []
  try {
    correctAnswers = dist.worksheet.answersJson ? JSON.parse(dist.worksheet.answersJson) : []
  } catch { /* 무시 */ }

  if (!correctAnswers.some(a => (a ?? '').trim() !== '')) {
    return NextResponse.json(
      { error: '아직 정답이 등록되지 않은 학습지입니다. 선생님께 알려주세요.' },
      { status: 400 }
    )
  }

  const graded = autoGrade(studentAnswers, correctAnswers, total)
  const correctProblems = graded.correct.length
  const rate = total > 0 ? correctProblems / total : 0
  const step = dist.worksheet.step as WorksheetStep

  // 능력치 — 기존 채점과 같은 계산식
  const weights = STEP_ABILITY_WEIGHT[step] ?? {}
  const gain = rate * 8
  const dComp = (weights.comprehension ?? 0) * gain
  const dReas = (weights.reasoning ?? 0) * gain
  const dCalc = (weights.calculation ?? 0) * gain

  await prisma.$transaction([
    prisma.worksheetResult.create({
      data: {
        distributionId,
        correctProblems,
        wrongProblemsJson: JSON.stringify(graded.wrong),
        studentAnswersJson: JSON.stringify(studentAnswers),
        pendingProblemsJson: JSON.stringify(graded.pending),
        gradedBy: 'student',
      },
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

  const level = await tryRecalcStudentLevel(student.id)
  const autoReward = await tryApplyAutoReward({
    teacherId: student.teacherId,
    studentId: student.id,
    sourceType: 'worksheet',
    sourceId: distributionId,
    correctRate,
  })

  return NextResponse.json({
    correctProblems,
    totalProblems: total,
    correctRate,
    cleared: correctRate >= STEP_CLEAR_THRESHOLD[step],
    wrongProblems: graded.wrong,
    // 선생님 확인이 필요한 문항 — 학생 화면에 '채점 보류'로 보여준다
    pendingProblems: graded.pending,
    level,
    autoReward,
  })
}
