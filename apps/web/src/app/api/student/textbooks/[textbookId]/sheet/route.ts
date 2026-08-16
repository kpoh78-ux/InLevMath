// GET /api/student/textbooks/[textbookId]/sheet?from=&limit=
//
// 학생 앱 OMR 화면이 쓸 교재 답안지.
// 정답은 절대 내려주지 않는다. 문제 번호와 유형(객관식/단답형)만 준다.
//
// 교재는 문제가 수천 개일 수 있어 한 번에 다 주지 않고 구간으로 끊어 준다.
// from 을 생략하면 아직 안 낸 첫 문제부터 시작한다.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyToken } from '@/lib/auth'
import { IMAGE_ANSWER_MARKER } from '@/lib/answers'

/** 한 화면에 보여줄 문항 수 */
const PAGE_SIZE = 50
const PAGE_SIZE_MAX = 200

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ textbookId: string }> }
) {
  const token = req.headers.get('authorization')?.split(' ')[1]
  if (!token) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload || payload.role !== 'student') {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  }

  const student = await prisma.student.findFirst({ where: { userId: payload.sub } })
  if (!student) return NextResponse.json({ error: '학생 정보 없음' }, { status: 404 })

  const { textbookId } = await params

  // 배정받은 교재만 볼 수 있다
  const assigned = await prisma.textbookAssignment.findFirst({
    where: { textbookId, studentId: student.id },
    select: { completedAt: true },
  })
  if (!assigned) return NextResponse.json({ error: '배정받지 않은 교재입니다.' }, { status: 403 })

  const textbook = await prisma.textbook.findUnique({
    where: { id: textbookId },
    select: { id: true, title: true, grade: true, publisher: true },
  })
  if (!textbook) return NextResponse.json({ error: '교재를 찾을 수 없습니다.' }, { status: 404 })

  // 이미 낸 답
  const result = await prisma.textbookResult.findUnique({
    where: { textbookId_studentId: { textbookId, studentId: student.id } },
    select: { studentAnswersJson: true, submittedCount: true },
  })
  let submitted: Record<string, string> = {}
  if (result) {
    try { submitted = JSON.parse(result.studentAnswersJson) } catch { /* 무시 */ }
  }

  const sp = req.nextUrl.searchParams
  const limit = Math.min(PAGE_SIZE_MAX, Math.max(1, parseInt(sp.get('limit') ?? '') || PAGE_SIZE))
  const fromParam = parseInt(sp.get('from') ?? '')

  const totalProblems = await prisma.textbookProblem.count({ where: { textbookId } })

  // from 이 없으면 아직 안 낸 첫 문제부터
  let from = Number.isInteger(fromParam) && fromParam > 0 ? fromParam : 1
  if (!Number.isInteger(fromParam) || fromParam <= 0) {
    const doneNos = Object.keys(submitted)
      .map(n => parseInt(n))
      .filter(n => Number.isInteger(n))
      .sort((a, b) => a - b)
    if (doneNos.length > 0) {
      const next = await prisma.textbookProblem.findFirst({
        where: { textbookId, number: { notIn: doneNos } },
        orderBy: { number: 'asc' },
        select: { number: true },
      })
      from = next?.number ?? doneNos[doneNos.length - 1]
    }
  }

  const rows = await prisma.textbookProblem.findMany({
    where: { textbookId, number: { gte: from } },
    orderBy: { number: 'asc' },
    take: limit,
    select: { number: true, type: true, answer: true, bookPage: true },
  })

  const problems = rows.map(p => ({
    number: p.number,
    // 정답 자체는 내려보내지 않는다. 유형과 '정답이 등록됐는지'만 준다
    type: p.type === 'short' || p.type === 'image' ? 'short' : 'multiple',
    bookPage: p.bookPage,
    hasAnswer: p.answer.trim() !== '' && p.answer !== IMAGE_ANSWER_MARKER,
    submitted: submitted[String(p.number)] ?? '',
  }))

  return NextResponse.json({
    textbookId: textbook.id,
    title: textbook.title,
    grade: textbook.grade,
    publisher: textbook.publisher,
    completed: assigned.completedAt !== null,
    totalProblems,
    submittedCount: result?.submittedCount ?? 0,
    from,
    nextFrom: rows.length === limit ? rows[rows.length - 1].number + 1 : null,
    problems,
  })
}
