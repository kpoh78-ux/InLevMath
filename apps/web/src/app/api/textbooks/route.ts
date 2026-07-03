import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/db'

// GET /api/textbooks — 내 교재 목록
export async function GET(req: NextRequest) {
  const auth = await getAuthUser(req)
  if (!auth || auth.role !== 'teacher') {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }
  const teacher = await prisma.teacher.findUnique({ where: { userId: auth.sub } })
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
  const teacher = await prisma.teacher.findUnique({ where: { userId: auth.sub } })
  if (!teacher) return NextResponse.json({ error: '선생님 정보를 찾을 수 없습니다.' }, { status: 404 })

  const { title, grade, publisher, problemCount } = await req.json() as {
    title: string; grade: string; publisher?: string; problemCount: number
  }
  if (!title || !grade || !problemCount) {
    return NextResponse.json({ error: '필수 항목이 누락되었습니다.' }, { status: 400 })
  }

  const textbook = await prisma.textbook.create({
    data: {
      title, grade,
      publisher: publisher || '직접 출제',
      teacherId: teacher.id,
      problems: {
        create: Array.from({ length: problemCount }, (_, i) => ({
          number: i + 1, unit: '', type: 'multiple', answer: '',
        })),
      },
    },
  })

  return NextResponse.json({ id: textbook.id }, { status: 201 })
}
