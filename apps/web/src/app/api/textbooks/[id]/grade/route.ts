import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getAuthUser } from '@/lib/auth'
import { academyTeacher } from '@/lib/academy'
import { tryRecalcStudentLevel } from '@/lib/studentLevel'

// 교재 채점 — **페이지 단위**.
//
// ── 왜 페이지 단위인가 ──────────────────────────────────────────────────────
// 교재는 한 번에 다 풀지 않는다. 오늘 90~94쪽, 다음 시간에 95~99쪽 하는 식이라
// 선생님은 "이 페이지를 다 봤나"로 일한다. 교재 한 권을 한 덩어리로 채점하면
// 어디까지 했는지 알 수 없고, 중간에 저장할 수도 없다.
//
// 정답 입력도 페이지 단위다 (PUT /api/textbooks/[id]/problems).
// 둘의 이동 단위를 맞춰야 화면이 따로 놀지 않는다.
//
// ── 저장 구조 ───────────────────────────────────────────────────────────────
//   TextbookPageProgress  페이지별 상태 (todo / doing / done) 와 채점 수
//   TextbookResult        교재 전체 누적 — 오답 번호와 낸 문항 수.
//                         레벨·능력치는 이 누적에서 나온다

export const dynamic = 'force-dynamic'

const STATUSES = ['todo', 'doing', 'done']

type Mark = 'O' | 'X'

/** GET ?studentId= — 페이지 목록과 그 학생의 페이지별 진도 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser(req)
  if (!user || user.role !== 'teacher') {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
  }
  const teacher = await academyTeacher(user.sub)
  if (!teacher) return NextResponse.json({ error: '선생님 정보 없음' }, { status: 404 })

  const { id } = await params
  const studentId = req.nextUrl.searchParams.get('studentId')
  if (!studentId) return NextResponse.json({ error: '학생을 선택하세요.' }, { status: 400 })

  const book = await prisma.textbook.findFirst({
    where: { id, teacherId: teacher.id },
    select: { id: true, title: true },
  })
  if (!book) return NextResponse.json({ error: '교재를 찾을 수 없습니다.' }, { status: 404 })

  // 페이지별 문항 수 — 전체 문제를 다 읽지 않는다 (교재는 수천 문항이다)
  const grouped = await prisma.textbookProblem.groupBy({
    by: ['bookPage'],
    where: { textbookId: id },
    _count: { _all: true },
    orderBy: { bookPage: 'asc' },
  })

  const progress = await prisma.textbookPageProgress.findMany({
    where: { textbookId: id, studentId },
  })
  const byPage = new Map(progress.map(p => [p.bookPage, p]))

  return NextResponse.json({
    textbook: book,
    pages: grouped.map(g => {
      const p = byPage.get(g.bookPage)
      return {
        bookPage: g.bookPage,
        problemCount: g._count._all,
        status: p?.status ?? 'todo',
        gradedCount: p?.gradedCount ?? 0,
        wrongCount: p?.wrongCount ?? 0,
        gradedAt: p?.gradedAt ?? null,
      }
    }),
  })
}

/**
 * PUT — 한 페이지를 채점한다.
 *
 * body: { studentId, bookPage, marks: { "12": "O", "13": "X" }, status? }
 *
 * marks 는 **이 페이지 문항만** 담는다. 보내지 않은 문항은 건드리지 않는다 —
 * 페이지를 나눠 채점하는 중에 다른 페이지 결과가 지워지면 안 된다.
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser(req)
  if (!user || user.role !== 'teacher') {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
  }
  const teacher = await academyTeacher(user.sub)
  if (!teacher) return NextResponse.json({ error: '선생님 정보 없음' }, { status: 404 })

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const { studentId, bookPage, marks, status } = body as {
    studentId?: string; bookPage?: number
    marks?: Record<string, Mark>; status?: string
  }

  if (!studentId || !Number.isInteger(bookPage)) {
    return NextResponse.json({ error: '학생과 페이지가 필요합니다.' }, { status: 400 })
  }
  if (status != null && !STATUSES.includes(status)) {
    return NextResponse.json({ error: `status 는 ${STATUSES.join(' | ')} 중 하나여야 합니다.` }, { status: 400 })
  }

  // 우리 학원 교재·학생인지 확인한다 — id 만 받고 그대로 쓰면 남의 것을 고칠 수 있다
  const [book, student] = await Promise.all([
    prisma.textbook.findFirst({ where: { id, teacherId: teacher.id }, select: { id: true } }),
    prisma.student.findFirst({ where: { id: studentId, teacherId: teacher.id }, select: { id: true } }),
  ])
  if (!book) return NextResponse.json({ error: '교재를 찾을 수 없습니다.' }, { status: 404 })
  if (!student) return NextResponse.json({ error: '학생을 찾을 수 없습니다.' }, { status: 404 })

  // 이 페이지에 실제로 있는 문항만 받는다. 없는 번호가 섞이면 집계가 어긋난다
  const pageProblems = await prisma.textbookProblem.findMany({
    where: { textbookId: id, bookPage: bookPage as number },
    select: { number: true },
  })
  const validNumbers = new Set(pageProblems.map(p => p.number))

  const marked: { number: number; mark: Mark }[] = []
  for (const [k, v] of Object.entries(marks ?? {})) {
    const n = Number(k)
    if (!validNumbers.has(n)) continue
    if (v !== 'O' && v !== 'X') continue
    marked.push({ number: n, mark: v })
  }

  const pageWrong = marked.filter(m => m.mark === 'X').map(m => m.number)

  // ── 교재 전체 누적 갱신 ───────────────────────────────────────────────────
  // 이 페이지 문항만 빼고 다시 넣는다. 통째로 덮어쓰면 다른 페이지가 사라진다.
  const prev = await prisma.textbookResult.findUnique({
    where: { textbookId_studentId: { textbookId: id, studentId } },
  })
  const prevWrong: number[] = (() => {
    try { const v = JSON.parse(prev?.wrongProblemsJson ?? '[]'); return Array.isArray(v) ? v : [] }
    catch { return [] }
  })()
  const prevGraded: number[] = (() => {
    try { const v = JSON.parse(prev?.studentAnswersJson ?? '{}'); return Object.keys(v).map(Number) }
    catch { return [] }
  })()

  const keptWrong = prevWrong.filter(n => !validNumbers.has(n))
  const nextWrong = [...new Set([...keptWrong, ...pageWrong])].sort((a, b) => a - b)

  // 채점한 문항 목록 — 정답률의 분모다. O/X 모두 '풀었다'로 센다
  const keptGraded = prevGraded.filter(n => !validNumbers.has(n))
  const nextGraded = [...new Set([...keptGraded, ...marked.map(m => m.number)])]
  const gradedMap: Record<string, string> = {}
  for (const n of nextGraded) gradedMap[String(n)] = nextWrong.includes(n) ? 'X' : 'O'

  const nextStatus = status
    ?? (marked.length >= validNumbers.size && validNumbers.size > 0 ? 'done' : 'doing')

  await prisma.$transaction([
    prisma.textbookPageProgress.upsert({
      where: { textbookId_studentId_bookPage: { textbookId: id, studentId, bookPage: bookPage as number } },
      create: {
        textbookId: id, studentId, bookPage: bookPage as number,
        status: nextStatus, gradedCount: marked.length, wrongCount: pageWrong.length,
        gradedAt: marked.length > 0 ? new Date() : null,
        gradedBy: user.name,
      },
      update: {
        status: nextStatus, gradedCount: marked.length, wrongCount: pageWrong.length,
        gradedAt: marked.length > 0 ? new Date() : null,
        gradedBy: user.name,
      },
    }),
    prisma.textbookResult.upsert({
      where: { textbookId_studentId: { textbookId: id, studentId } },
      create: {
        textbookId: id, studentId,
        wrongProblemsJson: JSON.stringify(nextWrong),
        studentAnswersJson: JSON.stringify(gradedMap),
        submittedCount: nextGraded.length,
        gradedBy: 'teacher',
      },
      update: {
        wrongProblemsJson: JSON.stringify(nextWrong),
        studentAnswersJson: JSON.stringify(gradedMap),
        submittedCount: nextGraded.length,
        gradedBy: 'teacher',
        submittedAt: new Date(),
      },
    }),
  ])

  // 레벨은 평균 정답률에서 나온다 — 채점이 바뀌었으니 다시 계산한다
  const level = await tryRecalcStudentLevel(studentId)

  return NextResponse.json({
    ok: true,
    bookPage,
    status: nextStatus,
    pageGraded: marked.length,
    pageWrong: pageWrong.length,
    totalGraded: nextGraded.length,
    totalWrong: nextWrong.length,
    correctRate: nextGraded.length > 0
      ? Math.round(((nextGraded.length - nextWrong.length) / nextGraded.length) * 100)
      : 0,
    level,
  })
}
