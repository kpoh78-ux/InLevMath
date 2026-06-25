import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/db'
import { getAuthUser } from '@/lib/auth'

const INITIAL_PASSWORD = 'math1234'

// POST /api/students/[id]/reset-password — 선생님이 학생 비밀번호를 math1234로 초기화
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req)
  if (!user || user.role !== 'teacher') {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
  }

  const teacher = await prisma.teacher.findUnique({ where: { userId: user.sub } })
  if (!teacher) return NextResponse.json({ error: '선생님 정보를 찾을 수 없습니다.' }, { status: 404 })

  // 해당 학생이 이 선생님 소속인지 확인
  const student = await prisma.student.findFirst({
    where: { id: params.id, teacherId: teacher.id },
    include: { user: true },
  })
  if (!student) return NextResponse.json({ error: '학생을 찾을 수 없습니다.' }, { status: 404 })

  const hashed = await bcrypt.hash(INITIAL_PASSWORD, 10)
  await prisma.user.update({
    where: { id: student.userId },
    data: { password: hashed },
  })

  return NextResponse.json({ message: `${student.user.name} 학생의 비밀번호가 초기화되었습니다. (${INITIAL_PASSWORD})` })
}
