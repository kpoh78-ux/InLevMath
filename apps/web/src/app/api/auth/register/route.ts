import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/db'
import { signToken } from '@/lib/auth'
import { APP_LIMITS } from '@inlevmath/shared'

export async function POST(req: NextRequest) {
  const { name, email, password, registrationCode } = await req.json()

  if (!name || !email || !password || !registrationCode) {
    return NextResponse.json({ error: '모든 항목을 입력하세요.' }, { status: 400 })
  }

  // 등록 코드로 선생님 조회
  const teacher = await prisma.teacher.findUnique({ where: { registrationCode } })
  if (!teacher) {
    return NextResponse.json({ error: '유효하지 않은 학원 등록 코드입니다.' }, { status: 400 })
  }

  // 학생 수 한도 확인
  const studentCount = await prisma.student.count({ where: { teacherId: teacher.id } })
  if (studentCount >= APP_LIMITS.maxStudents) {
    return NextResponse.json({ error: `학생 등록 한도(${APP_LIMITS.maxStudents}명)를 초과했습니다.` }, { status: 409 })
  }

  // 이메일 중복 확인
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    return NextResponse.json({ error: '이미 사용 중인 이메일입니다.' }, { status: 409 })
  }

  const hashed = await bcrypt.hash(password, 10)

  const user = await prisma.user.create({
    data: {
      name, email, password: hashed, role: 'student',
      student: { create: { teacherId: teacher.id } },
    },
  })

  const token = await signToken({ sub: user.id, role: 'student', name: user.name, email: user.email })

  return NextResponse.json(
    { token, user: { id: user.id, name: user.name, email: user.email, role: 'student' } },
    { status: 201 }
  )
}
