// GET /api/student/worksheets/[distributionId]/sheet
//
// 학생 앱 OMR 화면이 쓸 답안지 정보.
// 정답은 절대 내려주지 않는다. 문항 수와 문제 유형(객관식/단답형)만 준다.
// 유형은 저장된 정답 모양으로 판단한다 (학습지 정답에는 유형 컬럼이 없다).

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyToken } from '@/lib/auth'
import { inferAnswerType, type ProblemAnswerType } from '@inlevmath/shared'

export async function GET(
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

  const total = dist.worksheet.problemCount
  let answers: string[] = []
  try {
    answers = dist.worksheet.answersJson ? JSON.parse(dist.worksheet.answersJson) : []
  } catch { /* 손상된 값은 전부 단답형으로 본다 */ }

  const types: ProblemAnswerType[] = Array.from({ length: total }, (_, i) =>
    inferAnswerType(answers[i] ?? '')
  )

  // 정답이 하나도 없으면 자동 채점을 할 수 없다
  const answersReady = answers.some(a => (a ?? '').trim() !== '')

  let submitted: string[] = []
  if (dist.result) {
    try { submitted = JSON.parse(dist.result.studentAnswersJson) } catch { /* 무시 */ }
  }

  return NextResponse.json({
    distributionId: dist.id,
    title: dist.worksheet.title,
    step: dist.worksheet.step,
    examSubType: dist.worksheet.examSubType,
    problemCount: total,
    types,
    answersReady,
    alreadyGraded: !!dist.result,
    submittedAnswers: submitted,
  })
}
