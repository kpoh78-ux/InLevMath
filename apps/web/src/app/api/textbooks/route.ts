import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { MAX_TEXTBOOK_PROBLEMS } from '@/lib/answers'
import { academyTeacher } from '@/lib/academy'

// GET /api/textbooks — 내 교재 목록
export async function GET(req: NextRequest) {
  const auth = await getAuthUser(req)
  if (!auth || auth.role !== 'teacher') {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }
  const teacher = await academyTeacher(auth.sub)
  if (!teacher) return NextResponse.json({ error: '선생님 정보를 찾을 수 없습니다.' }, { status: 404 })

  const textbooks = await prisma.textbook.findMany({
    where: { teacherId: teacher.id },
    include: { _count: { select: { problems: true } } },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(textbooks.map(t => ({
    id: t.id, title: t.title, grade: t.grade,
    publisher: t.publisher, createdAt: t.createdAt,
    problemCount: t._count.problems,
  })))
}

// POST /api/textbooks — 교재 등록
export async function POST(req: NextRequest) {
  const auth = await getAuthUser(req)
  if (!auth || auth.role !== 'teacher') {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }
  const teacher = await academyTeacher(auth.sub)
  if (!teacher) return NextResponse.json({ error: '선생님 정보를 찾을 수 없습니다.' }, { status: 404 })

  const { title, grade, publisher, problemCount } = await req.json() as {
    title: string; grade: string; publisher?: string; problemCount: number
  }
  if (!title || !grade || !problemCount) {
    return NextResponse.json({ error: '필수 항목이 누락되었습니다.' }, { status: 400 })
  }

  const count = Math.floor(Number(problemCount))
  if (!Number.isInteger(count) || count < 1 || count > MAX_TEXTBOOK_PROBLEMS) {
    return NextResponse.json(
      { error: `문제 수는 1~${MAX_TEXTBOOK_PROBLEMS} 사이로 입력해주세요.` },
      { status: 400 }
    )
  }

  const textbook = await prisma.textbook.create({
    data: { title, grade, publisher: publisher || '직접 출제', teacherId: teacher.id },
  })

  // 수천 개를 중첩 create로 만들면 쿼리가 지나치게 커지므로 createMany로 일괄 삽입
  await prisma.textbookProblem.createMany({
    data: Array.from({ length: count }, (_, i) => ({
      textbookId: textbook.id, number: i + 1, type: 'multiple', answer: '',
    })),
  })

  return NextResponse.json({ id: textbook.id }, { status: 201 })
}
