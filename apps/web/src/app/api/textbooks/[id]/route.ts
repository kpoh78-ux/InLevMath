import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/db'

// GET /api/textbooks/[id] — 교재 상세 (문제 + 학생별 채점 결과)
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser(req)
  if (!auth || auth.role !== 'teacher') {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }
  const { id } = await params
  const teacher = await prisma.teacher.findUnique({ where: { userId: auth.sub } })
  if (!teacher) return NextResponse.json({ error: '선생님 정보를 찾을 수 없습니다.' }, { status: 404 })

  const textbook = await prisma.textbook.findFirst({
    where: { id, teacherId: teacher.id },
    include: {
      problems: { orderBy: { number: 'asc' } },
      results: {
        include: { student: { include: { user: { select: { name: true } } } } },
      },
    },
  })
  if (!textbook) return NextResponse.json({ error: '교재를 찾을 수 없습니다.' }, { status: 404 })

  const students = await prisma.student.findMany({
    where: { teacherId: teacher.id, status: 'active' },
    include: { user: { select: { name: true } } },
    orderBy: { grade: 'asc' },
  })

  return NextResponse.json({
    id: textbook.id, title: textbook.title,
    grade: textbook.grade, publisher: textbook.publisher,
    problems: textbook.problems.map(p => ({
      id: p.id, number: p.number, unit: p.unit, type: p.type, answer: p.answer,
    })),
    results: textbook.results.map(r => ({
      studentId: r.studentId,
      studentName: r.student.user.name,
      wrongProblemsJson: r.wrongProblemsJson,
      submittedAt: r.submittedAt,
    })),
    students: students.map(s => ({
      id: s.id, name: s.user.name, grade: s.grade,
    })),
  })
}

// DELETE /api/textbooks/[id]
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser(req)
  if (!auth || auth.role !== 'teacher') {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }
  const { id } = await params
  const teacher = await prisma.teacher.findUnique({ where: { userId: auth.sub } })
  if (!teacher) return NextResponse.json({ error: '선생님 정보를 찾을 수 없습니다.' }, { status: 404 })

  const textbook = await prisma.textbook.findFirst({ where: { id, teacherId: teacher.id } })
  if (!textbook) return NextResponse.json({ error: '교재를 찾을 수 없습니다.' }, { status: 404 })

  await prisma.textbook.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
