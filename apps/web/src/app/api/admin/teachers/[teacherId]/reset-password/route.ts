import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/db'
import { requireAdmin } from '@/lib/teacherAuth'

// POST /api/admin/teachers/[teacherId]/reset-password
//
// 관리자가 선생님·교육실장의 비밀번호를 초기 비밀번호로 되돌린다.
// 비밀번호를 잊었을 때 쓰는 문이라 현재 비밀번호를 묻지 않는다.
//
// Supabase Auth 비밀번호는 HMAC(JWT_SECRET, "supa_"+userId) 로 서버가 따로 들고
// 있어 사용자 비밀번호와 무관하다. 그래서 여기서는 bcrypt 해시만 바꾸면 되고
// Supabase 쪽은 건드리지 않는다.

const INITIAL_PASSWORD = process.env.TEACHER_INITIAL_PASSWORD ?? 'math1234'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ teacherId: string }> }
) {
  const guard = await requireAdmin(req)
  if ('response' in guard) return guard.response

  const { teacherId } = await params

  const target = await prisma.teacher.findUnique({
    where: { id: teacherId },
    select: { userId: true, user: { select: { name: true } } },
  })
  if (!target) {
    return NextResponse.json({ error: '선생님을 찾을 수 없습니다.' }, { status: 404 })
  }

  await prisma.user.update({
    where: { id: target.userId },
    data: { password: await bcrypt.hash(INITIAL_PASSWORD, 10) },
  })

  return NextResponse.json({
    ok: true,
    name: target.user.name,
    initialPassword: INITIAL_PASSWORD,
    message: `${target.user.name} 선생님의 비밀번호가 초기화되었습니다.`,
  })
}
