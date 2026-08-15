import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/db'
import { supabaseAdmin } from '@/lib/supabase'
import { ensureSupabaseUser } from '@/lib/auth'
import { requireAdmin } from '@/lib/teacherAuth'
import { APP_LIMITS } from '@inlevmath/shared'

// GET /api/admin/teachers — 선생님 목록 (관리자 전용)
export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req)
  if ('response' in guard) return guard.response

  const teachers = await prisma.teacher.findMany({
    include: {
      user: { select: { id: true, name: true, phone: true, createdAt: true } },
      _count: { select: { students: true, worksheets: true, textbooks: true } },
    },
  })

  return NextResponse.json(
    teachers
      .map(t => ({
        id: t.id,
        userId: t.user.id,
        name: t.user.name,
        phone: t.user.phone,
        isAdmin: t.isAdmin,
        createdAt: t.user.createdAt,
        studentCount: t._count.students,
        worksheetCount: t._count.worksheets,
        textbookCount: t._count.textbooks,
        isMe: t.id === guard.auth.teacherId,
      }))
      .sort((a, b) => Number(b.isAdmin) - Number(a.isAdmin)
        || a.createdAt.getTime() - b.createdAt.getTime())
  )
}

// POST /api/admin/teachers — 선생님 계정 등록 (관리자 전용)
// body: { name, phone, password?, isAdmin? }
export async function POST(req: NextRequest) {
  const guard = await requireAdmin(req)
  if ('response' in guard) return guard.response

  const { name, phone, password, isAdmin } = await req.json() as {
    name?: string; phone?: string; password?: string; isAdmin?: boolean
  }

  if (!name?.trim() || !phone?.trim()) {
    return NextResponse.json({ error: '이름과 핸드폰번호를 입력하세요.' }, { status: 400 })
  }
  if (!/^\d{11}$/.test(phone)) {
    return NextResponse.json({ error: '핸드폰번호는 11자리 숫자로 입력하세요.' }, { status: 400 })
  }

  const count = await prisma.teacher.count()
  if (count >= APP_LIMITS.maxTeachers) {
    return NextResponse.json(
      { error: `선생님 등록 한도(${APP_LIMITS.maxTeachers}명)를 초과했습니다.` }, { status: 409 }
    )
  }

  const existing = await prisma.user.findUnique({
    where: { phone },
    select: { name: true, role: true },
  })
  if (existing) {
    return NextResponse.json(
      {
        error: existing.role === 'teacher'
          ? `이미 등록된 선생님입니다. (${existing.name}) 목록을 새로고침해 확인하세요.`
          : `이 번호는 학생 ${existing.name}의 로그인 아이디로 사용 중입니다.`,
      },
      { status: 409 }
    )
  }

  // 비밀번호를 안 주면 학생과 같은 초기 비밀번호를 쓴다
  const initialPassword = password?.trim() || 'math1234'

  const user = await prisma.user.create({
    data: {
      name: name.trim(), phone,
      password: await bcrypt.hash(initialPassword, 10),
      role: 'teacher',
      teacher: { create: { isAdmin: isAdmin === true } },
    },
  })

  // Supabase Auth 계정도 만들어 두되, 실패해도 등록 자체는 성공으로 둔다.
  // Supabase가 막혀 있어도 로그인은 로컬 JWT로 폴백되고, 다음 로그인 때 다시 시도된다.
  // (여기서 예외가 나면 User/Teacher만 남아 재등록이 막히는 반쪽 계정이 생긴다)
  let authReady = true
  try {
    await ensureSupabaseUser(user.id, user.phone)
  } catch (e) {
    authReady = false
    console.warn('[admin/teachers] Supabase 계정 생성 실패 — 로컬 JWT로 로그인합니다:',
      e instanceof Error ? e.message : e)
  }

  return NextResponse.json(
    {
      ok: true,
      teacher: { id: user.id, name: user.name, phone: user.phone, isAdmin: isAdmin === true },
      initialPassword,
      authReady,
    },
    { status: 201 }
  )
}

// DELETE /api/admin/teachers — body: { teacherId }
// 담당 학생이 있으면 거부한다 (학생 데이터가 함께 지워지는 사고 방지)
export async function DELETE(req: NextRequest) {
  const guard = await requireAdmin(req)
  if ('response' in guard) return guard.response

  const { teacherId } = await req.json().catch(() => ({})) as { teacherId?: string }
  if (!teacherId) return NextResponse.json({ error: '선생님을 선택하세요.' }, { status: 400 })

  if (teacherId === guard.auth.teacherId) {
    return NextResponse.json({ error: '본인 계정은 삭제할 수 없습니다.' }, { status: 400 })
  }

  const target = await prisma.teacher.findUnique({
    where: { id: teacherId },
    include: {
      user: { select: { id: true, name: true, supabaseId: true } },
      _count: { select: { students: true } },
    },
  })
  if (!target) return NextResponse.json({ error: '선생님을 찾을 수 없습니다.' }, { status: 404 })

  if (target._count.students > 0) {
    return NextResponse.json(
      {
        error: `${target.user.name} 선생님에게 담당 학생 ${target._count.students}명이 있습니다. ` +
               `학생을 다른 선생님에게 옮긴 뒤 삭제하세요.`,
      },
      { status: 409 }
    )
  }

  if (target.user.supabaseId) {
    await supabaseAdmin.auth.admin.deleteUser(target.user.supabaseId)
  }
  // User 삭제 → Teacher, 학습지/교재 등 cascade
  await prisma.user.delete({ where: { id: target.user.id } })

  return NextResponse.json({ ok: true })
}

// PATCH /api/admin/teachers — body: { teacherId, isAdmin } 관리자 권한 부여/회수
export async function PATCH(req: NextRequest) {
  const guard = await requireAdmin(req)
  if ('response' in guard) return guard.response

  const { teacherId, isAdmin } = await req.json().catch(() => ({})) as {
    teacherId?: string; isAdmin?: boolean
  }
  if (!teacherId || typeof isAdmin !== 'boolean') {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 })
  }

  // 관리자가 0명이 되면 아무도 선생님을 관리할 수 없다
  if (!isAdmin) {
    if (teacherId === guard.auth.teacherId) {
      return NextResponse.json({ error: '본인의 관리자 권한은 해제할 수 없습니다.' }, { status: 400 })
    }
    const adminCount = await prisma.teacher.count({ where: { isAdmin: true } })
    if (adminCount <= 1) {
      return NextResponse.json({ error: '관리자는 최소 1명 있어야 합니다.' }, { status: 400 })
    }
  }

  await prisma.teacher.update({ where: { id: teacherId }, data: { isAdmin } })
  return NextResponse.json({ ok: true })
}