// POST /api/student/worksheets/[distributionId]/submit
//
// 학생이 OMR·수식 키패드로 낸 답을 받아 저장된 정답과 맞춰 1차 채점한다.
// body: { answers: string[] }  — 1번부터 순서대로. 빈 문자열은 '아직 안 냄'이다.
//
// 부분 제출을 지원한다.
//   · 낸 문항은 잠긴다. 학생이 다시 못 고친다 (고치려면 선생님이 채점 화면에서)
//   · 아직 안 낸 문항은 나중에 이어서 낼 수 있다
//   · 정답률은 낸 문항 수를 분모로 한다 (푼 만큼만 평가한다)
//
// 자동으로 판정하지 못한 문항(정답이 비었거나 이미지)은 pending 으로 남긴다.
// 선생님이 나중에 채점 화면에서 최종 판단한다.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyToken } from '@/lib/auth'
import {
  autoGrade, STEP_ABILITY_WEIGHT, STEP_CLEAR_THRESHOLD, WorksheetStep,
  buildGradingFeedback,
} from '@inlevmath/shared'
import { tryApplyAutoReward } from '@/lib/autoReward'
import { tryRecalcStudentLevel } from '@/lib/studentLevel'
import { broadcastToTeacher } from '@/lib/sse'

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

  const student = await prisma.student.findFirst({
    where: { userId: payload.sub },
    include: { user: { select: { name: true } } },
  })
  if (!student) return NextResponse.json({ error: '학생 정보 없음' }, { status: 404 })

  const { distributionId } = await params
  const dist = await prisma.worksheetDistribution.findFirst({
    where: { id: distributionId, studentId: student.id },
    include: { worksheet: true, result: true },
  })
  if (!dist) return NextResponse.json({ error: '배포 기록 없음' }, { status: 404 })

  const body = await req.json().catch(() => ({})) as { answers?: unknown }
  if (!Array.isArray(body.answers)) {
    return NextResponse.json({ error: '답안을 확인해주세요.' }, { status: 400 })
  }

  const total = dist.worksheet.problemCount

  // 이미 낸 답 — 이 자리는 잠겨 있어 새 값으로 덮어쓰지 않는다
  let locked: string[] = []
  if (dist.result) {
    try { locked = JSON.parse(dist.result.studentAnswersJson) } catch { /* 무시 */ }
  }

  const incoming = body.answers as unknown[]
  const studentAnswers = Array.from({ length: total }, (_, i) => {
    const already = typeof locked[i] === 'string' ? locked[i].trim() : ''
    if (already !== '') return already          // 잠긴 자리는 그대로 둔다
    return typeof incoming[i] === 'string' ? (incoming[i] as string).trim().slice(0, 200) : ''
  })

  const submittedCount = studentAnswers.filter(a => a !== '').length
  const newlySubmitted = submittedCount - locked.filter(a => (a ?? '').trim() !== '').length
  if (newlySubmitted <= 0) {
    return NextResponse.json({ error: '새로 낸 답이 없습니다.' }, { status: 400 })
  }

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

  // 아직 안 낸 문항은 채점 대상이 아니다 — 정답을 비워 pending 으로 빠지게 두지 않고
  // 아예 제외하기 위해 낸 문항만 골라 채점한다
  const graded = autoGrade(studentAnswers, correctAnswers, total)
  const notSubmitted = new Set(
    studentAnswers.map((a, i) => (a === '' ? i + 1 : 0)).filter(n => n > 0)
  )
  graded.correct = graded.correct.filter(n => !notSubmitted.has(n))
  graded.wrong = graded.wrong.filter(n => !notSubmitted.has(n))
  graded.pending = graded.pending.filter(n => !notSubmitted.has(n))

  const correctProblems = graded.correct.length
  // 푼 만큼만 평가한다
  const rate = submittedCount > 0 ? correctProblems / submittedCount : 0
  const step = dist.worksheet.step as WorksheetStep

  // 능력치 — 이번에 새로 낸 몫만큼만 올린다.
  // 부분 제출마다 전체 몫을 주면 나눠 낼수록 능력치가 부풀어 오른다
  const weights = STEP_ABILITY_WEIGHT[step] ?? {}
  const gain = rate * 8 * (total > 0 ? newlySubmitted / total : 0)
  const dComp = (weights.comprehension ?? 0) * gain
  const dReas = (weights.reasoning ?? 0) * gain
  const dCalc = (weights.calculation ?? 0) * gain

  const complete = submittedCount >= total
  const resultData = {
    correctProblems,
    wrongProblemsJson: JSON.stringify(graded.wrong),
    studentAnswersJson: JSON.stringify(studentAnswers),
    pendingProblemsJson: JSON.stringify(graded.pending),
    submittedCount,
    gradedBy: 'student',
  }

  await prisma.$transaction([
    prisma.worksheetResult.upsert({
      where: { distributionId },
      create: { distributionId, ...resultData },
      update: resultData,
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
      // 다 내야 '채점완료'. 부분 제출은 '제출됨'으로 남겨 이어서 낼 수 있게 한다
      data: { status: complete ? 'graded' : 'submitted' },
    }),
  ])

  const correctRate = Math.round(rate * 100)

  const level = await tryRecalcStudentLevel(student.id)

  // ── 학생에게 돌려줄 피드백 ────────────────────────────────────────────────
  // 지난번 성적과 견주려면 **이번 것을 뺀** 직전 채점을 찾아야 한다.
  // 방금 저장한 결과가 섞이면 자기 자신과 비교하게 된다.
  const prev = await prisma.worksheetResult.findFirst({
    where: {
      distribution: { studentId: student.id },
      distributionId: { not: distributionId },
      submittedCount: { gt: 0 },
    },
    orderBy: { submittedAt: 'desc' },
    select: {
      correctProblems: true, submittedCount: true,
      distribution: { select: { worksheet: { select: { problemCount: true } } } },
    },
  })
  const previousRate = prev && prev.submittedCount > 0
    ? Math.round((prev.correctProblems / prev.submittedCount) * 100)
    : null

  const feedback = buildGradingFeedback({
    correctProblems,
    totalProblems: submittedCount,
    previousRate,
    levelBefore: level?.levelBefore ?? null,
    levelAfter: level?.level ?? 1,
    avgRate: level?.avgCorrectRate ?? null,
    nextStep: complete
      ? (graded.wrong.length > 0
          ? `틀린 ${graded.wrong.length}문제를 다시 풀어 보세요.`
          : '다음 학습지로 넘어가도 좋습니다.')
      : `아직 ${total - submittedCount}문제가 남았습니다.`,
  })

  // 자동 보상은 다 낸 뒤에 한 번만 준다.
  // 부분 제출 때 주면 몇 문제만 맞히고 보상을 받아 갈 수 있다
  const autoReward = complete
    ? await tryApplyAutoReward({
        teacherId: student.teacherId,
        studentId: student.id,
        sourceType: 'worksheet',
        sourceId: distributionId,
        correctRate,
      })
    : null

  // SSE: 학생 답안 제출 실시간 알림 (100ms 내 교사 대시보드 팝업 전송)
  broadcastToTeacher(student.teacherId, {
    type: 'WORKSHEET_SUBMIT',
    studentId: student.id,
    studentName: student.user.name,
    worksheetTitle: dist.worksheet.title,
    step: dist.worksheet.step,
    totalProblems: total,
    submittedCount,
    correctProblems,
    correctRate,
    complete,
  })

  return NextResponse.json({
    correctProblems,
    totalProblems: total,
    submittedCount,
    remaining: total - submittedCount,
    complete,
    correctRate,
    cleared: correctRate >= STEP_CLEAR_THRESHOLD[step],
    wrongProblems: graded.wrong,
    // 선생님 확인이 필요한 문항 — 학생 화면에 '채점 보류'로 보여준다
    pendingProblems: graded.pending,
    level,
    autoReward,
    // 학생 앱이 그대로 팝업에 쓰는 피드백 (등급·성적변화·레벨변화·소리)
    feedback,
  })
}
