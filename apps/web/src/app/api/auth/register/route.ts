import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/db'
import { signToken } from '@/lib/auth'
import { APP_LIMITS } from '@inlevmath/shared'

// POST /api/auth/register — 선생님 계정 생성 (최대 3명)
export async function POST(req: NextRequest) {
  const { name, phone, password } = await req.json()

  if (!name || !phone || !password) {
    return NextResponse.json({ error: '모든 항목을 입력하세요.' }, { status: 400 })
  }

  if (!/^\d{11}$/.test(phone)) {
    return NextResponse.json({ error: '핸드폰번호는 11자리 숫자로 입력하세요.' }, { status: 400 })
  }

  // 선생님 수 한도 확인
  const teacherCount = await prisma.teacher.count()
  if (teacherCount >= APP_LIMITS.maxTeachers) {
    return NextResponse.json({ error: `선생님 등록 한도(${APP_LIMITS.maxTeachers}명)를 초과했습니다.` }, { status: 409 })
  }

  const existing = await prisma.user.findUnique({ where: { phone } })
  if (existing) {
    return NextResponse.json({ error: '이미 사용 중인 핸드폰번호입니다.' }, { status: 409 })
  }

  const hashed = await bcrypt.hash(password, 10)

  const user = await prisma.user.create({
    data: {
      name, phone, password: hashed, role: 'teacher',
      teacher: { create: {} },
    },
  })

  const token = await signToken({ sub: user.id, role: 'teacher', name: user.name, phone: user.phone })

  return NextResponse.json(
    { token, user: { id: user.id, name: user.name, phone: user.phone, role: 'teacher' } },
    { status: 201 }
  )
}
