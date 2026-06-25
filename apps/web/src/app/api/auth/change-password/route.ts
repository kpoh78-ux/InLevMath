import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/db'
import { getAuthUser } from '@/lib/auth'

// POST /api/auth/change-password — 본인 비밀번호 변경
export async function POST(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const { currentPassword, newPassword } = await req.json()

  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: '현재 비밀번호와 새 비밀번호를 입력하세요.' }, { status: 400 })
  }

  if (newPassword.length < 6) {
    return NextResponse.json({ error: '새 비밀번호는 6자 이상이어야 합니다.' }, { status: 400 })
  }

  const dbUser = await prisma.user.findUnique({ where: { id: user.sub } })
  if (!dbUser) return NextResponse.json({ error: '사용자를 찾을 수 없습니다.' }, { status: 404 })

  const valid = await bcrypt.compare(currentPassword, dbUser.password)
  if (!valid) return NextResponse.json({ error: '현재 비밀번호가 일치하지 않습니다.' }, { status: 401 })

  const hashed = await bcrypt.hash(newPassword, 10)
  await prisma.user.update({ where: { id: user.sub }, data: { password: hashed } })

  return NextResponse.json({ message: '비밀번호가 변경되었습니다.' })
}
