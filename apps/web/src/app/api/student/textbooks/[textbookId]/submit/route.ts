// POST /api/student/textbooks/[textbookId]/submit
//
// 학생이 낸 교재 답을 저장된 정답과 맞춰 1차 채점한다.
// body: { answers: { [문제번호]: 답 } }
//
// 학습지와 같은 규칙이다.
//   · 낸 문항은 잠긴다. 학생은 못 고친다 (고치려면 선생님이 채점 화면에서)
//   · 남은 문항은 나중에 이어서 낸다
//   · 정답률은 낸 문항 수를 분모로 한다
//   · 판정할 수 없는 문항(정답이 비었거나 이미지)은 pending 으로 남긴다

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyToken } from '@/lib/auth'
import { answersMatch, buildGradingFeedback } from '@inlevmath/shared'
import { tryApplyAutoReward } from '@/lib/autoReward'
import { tryRecalcStudentLevel } from '@/lib/studentLevel'
import { broadcastToTeacher } from '@/lib/sse'

/** 한 번에 낼 수 있는 문항 수 */
const MAX_PER_SUBMIT = 300

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ textbookId: string }> }
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

  const { textbookId } = await params
  const assigned = await prisma.textbookAssignment.findFirst({
    where: { textbookId, studentId: student.id },
    include: { textbook: { select: { title: true } } },
  })
  if (!assigned) return NextResponse.json({ error: '배정받지 않은 교재입니다.' }, { status: 403 })

  const body = await req.json().catch(() => ({})) as { answers?: unknown }
  const incoming = body.answers
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
    return NextResponse.json({ error: '답안을 확인해주세요.' }, { status: 400 })
  }

  const incomingMap = incoming as Record<string, unknown>
  const incomingNos = Object.keys(incomingMap)
    .map(n => parseInt(n))
    .filter(n => Number.isInteger(n) && n > 0)
  if (incomingNos.length === 0) {
    return NextResponse.json({ error: '새로 낸 답이 없습니다.' }, { status: 400 })
  }
  if (incomingNos.length > MAX_PER_SUBMIT) {
    return NextResponse.json(
      { error: `한 번에 ${MAX_PER_SUBMIT}문항까지 낼 수 있습니다.` }, { status: 400 }
    )
  }

  // 기존 답 — 잠긴 자리는 덮어쓰지 않는다
  const existing = await prisma.textbookResult.findUnique({
    where: { textbookId_studentId: { textbookId, studentId: student.id } },
  })
  let locked: Record<string, string> = {}
  if (existing) {
    try { locked = JSON.parse(existing.studentAnswersJson) } catch { /* 무시 */ }
  }

  const merged: Record<string, string> = { ...locked }
  const newNos: number[] = []
  for (const no of incomingNos) {
    const key = String(no)
    if ((merged[key] ?? '').trim() !== '') continue      // 이미 낸 답은 유지
    const v = incomingMap[key]
    const answer = typeof v === 'string' ? v.trim().slice(0, 200) : ''
    if (answer === '') continue
    merged[key] = answer
    newNos.push(no)
  }
  if (newNos.length === 0) {
    return NextResponse.json({ error: '새로 낸 답이 없습니다.' }, { status: 400 })
  }

  // 낸 문항의 정답만 읽는다 (교재 전체를 읽지 않는다)
  const answeredNos = Object.keys(merged).map(n => parseInt(n)).filter(Number.isInteger)
  const problems = await prisma.textbookProblem.findMany({
    where: { textbookId, number: { in: answeredNos } },
    select: { number: true, answer: true },
  })
  const correctBy = new Map(problems.map(p => [p.number, p.answer]))

  const wrong: number[] = []
  const pending: number[] = []
  let correctCount = 0
  for (const no of answeredNos) {
    const verdict = answersMatch(merged[String(no)] ?? '', correctBy.get(no) ?? '')
    if (verdict === null) pending.push(no)
    else if (verdict) correctCount++
    else wrong.push(no)
  }

  const submittedCount = answeredNos.length
  const rate = submittedCount > 0 ? correctCount / submittedCount : 0
  const totalProblems = await prisma.textbookProblem.count({ where: { textbookId } })
  const complete = submittedCount >= totalProblems

  // 능력치 — 이번에 새로 낸 몫만큼만. 교재는 종합 가중치를 쓴다
  const gain = rate * 8 * (totalProblems > 0 ? newNos.length / totalProblems : 0)

  const data = {
    wrongProblemsJson: JSON.stringify(wrong.sort((a, b) => a - b)),
    studentAnswersJson: JSON.stringify(merged),
    pendingProblemsJson: JSON.stringify(pending.sort((a, b) => a - b)),
    submittedCount,
    gradedBy: 'student',
    submittedAt: new Date(),
  }

  await prisma.$transaction([
    prisma.textbookResult.upsert({
      where: { textbookId_studentId: { textbookId, studentId: student.id } },
      create: { textbookId, studentId: student.id, ...data },
      update: data,
    }),
    prisma.student.update({
      where: { id: student.id },
      data: {
        comprehension: { increment: 0.35 * gain },
        reasoning:     { increment: 0.35 * gain },
        calculation:   { increment: 0.30 * gain },
      },
    }),
  ])

  const correctRate = Math.round(rate * 100)
  const level = await tryRecalcStudentLevel(student.id)

  // ── 학생에게 돌려줄 피드백 ────────────────────────────────────────────────
  // 교재는 한 학생당 한 행을 계속 갱신하므로, 이번 제출 **전** 상태(existing)가
  // 곧 지난번 성적이다. 갱신 뒤에 읽으면 자기 자신과 비교하게 된다.
  const prevWrong = (() => {
    if (!existing) return null
    try {
      const w = JSON.parse(existing.wrongProblemsJson)
      return Array.isArray(w) ? w.length : null
    } catch { return null }
  })()
  const previousRate =
    existing && existing.submittedCount > 0 && prevWrong != null
      ? Math.round(((existing.submittedCount - prevWrong) / existing.submittedCount) * 100)
      : null

  const feedback = buildGradingFeedback({
    correctProblems: correctCount,
    totalProblems: submittedCount,
    previousRate,
    levelBefore: level?.levelBefore ?? null,
    levelAfter: level?.level ?? 1,
    avgRate: level?.avgCorrectRate ?? null,
    nextStep: complete
      ? (wrong.length > 0
          ? `틀린 ${wrong.length}문제를 다시 풀어 보세요.`
          : '교재를 끝냈습니다. 선생님께 알리세요.')
      : `아직 ${Math.max(0, totalProblems - submittedCount)}문제가 남았습니다.`,
  })

  // 자동 보상은 교재를 다 낸 뒤 한 번만
  const autoReward = complete
    ? await tryApplyAutoReward({
        teacherId: student.teacherId,
        studentId: student.id,
        sourceType: 'textbook',
        sourceId: textbookId,
        correctRate,
      })
    : null

  // SSE: 학생 교재 답안 제출 실시간 알림 (100ms 내 교사 대시보드 팝업 전송)
  broadcastToTeacher(student.teacherId, {
    type: 'TEXTBOOK_SUBMIT',
    studentId: student.id,
    studentName: student.user.name,
    textbookTitle: assigned.textbook.title,
    totalProblems,
    submittedCount,
    correctProblems: correctCount,
    correctRate,
    complete,
  })

  return NextResponse.json({
    correctProblems: correctCount,
    totalProblems,
    submittedCount,
    remaining: Math.max(0, totalProblems - submittedCount),
    complete,
    correctRate,
    feedback,
    wrongProblems: wrong,
    pendingProblems: pending,
    level,
    autoReward,
  })
}
