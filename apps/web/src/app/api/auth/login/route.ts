import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/db'
import { signInWithSupabase } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const { phone, password } = await req.json()

  if (!phone || !password) {
    return NextResponse.json({ error: '핸드폰번호와 비밀번호를 입력하세요.' }, { status: 400 })
  }

  const user = await prisma.user.findUnique({ where: { phone } })
  if (!user) {
    return NextResponse.json({ error: '계정을 찾을 수 없습니다.' }, { status: 401 })
  }

  const valid = await bcrypt.compare(password, user.password)
  if (!valid) {
    return NextResponse.json({ error: '비밀번호가 일치하지 않습니다.' }, { status: 401 })
  }

  // bcrypt 검증 성공 → JWT 발급
  try {
    const token = await signInWithSupabase(user.id, user.phone)
    return NextResponse.json({
      token,
      user: { id: user.id, name: user.name, phone: user.phone, role: user.role },
    })
  } catch (e: any) {
    console.error('[login] JWT 발급 실패:', e?.message)
    return NextResponse.json({ error: 'JWT 발급에 실패했습니다.' }, { status: 500 })
  }
}
