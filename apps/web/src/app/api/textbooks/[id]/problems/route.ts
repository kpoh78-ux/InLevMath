import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/db'

type ProblemInput = { id: string; number: number; unit: string; type: string; answer: string }

// PUT /api/textbooks/[id]/problems — 문제 목록 전체 저장 (upsert)
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser(req)
  if (!auth || auth.role !== 'teacher') {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }
  const { id } = await params
  const teacher = await prisma.teacher.findUnique({ where: { userId: auth.sub } })
  if (!teacher) return NextResponse.json({ error: '선생님 정보를 찾을 수 없습니다.' }, { status: 404 })

  const textbook = await prisma.textbook.findFirst({ where: { id, teacherId: teacher.id } })
  if (!textbook) return NextResponse.json({ error: '교재를 찾을 수 없습니다.' }, { status: 404 })

  const { problems } = await req.json() as { problems: ProblemInput[] }

  await prisma.$transaction([
    prisma.textbookProblem.deleteMany({ where: { textbookId: id } }),
    prisma.textbookProblem.createMany({
      data: problems.map(p => ({
        id: p.id,
        textbookId: id,
        number: p.number,
        unit: p.unit || '',
        type: p.type || 'multiple',
        answer: p.answer || '',
      })),
    }),
  ])

  return NextResponse.json({ ok: true })
}
