import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getAuthUser } from '@/lib/auth'

// GET /api/students — 선생님이 자신의 학생 목록 조회
export async function GET(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user || user.role !== 'teacher') {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
  }

  const teacher = await prisma.teacher.findUnique({ where: { userId: user.sub } })
  if (!teacher) return NextResponse.json({ error: '선생님 정보를 찾을 수 없습니다.' }, { status: 404 })

  const students = await prisma.student.findMany({
    where: { teacherId: teacher.id },
    include: {
      user: { select: { id: true, name: true, email: true, createdAt: true } },
      results: { orderBy: { createdAt: 'desc' }, take: 5 },
    },
    orderBy: { currentLevel: 'desc' },
  })

  return NextResponse.json(students)
}
