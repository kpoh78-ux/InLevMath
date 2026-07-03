import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { prisma } from '@/lib/db'

// PATCH /api/students/[id] — 퇴원 처리 (status → withdrawn, 데이터 보존)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser(req)
  if (!auth || auth.role !== 'teacher') {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  const { id } = await params
  const { status } = await req.json() as { status: 'active' | 'withdrawn' }

  const teacher = await prisma.teacher.findUnique({ where: { userId: auth.sub } })
  if (!teacher) return NextResponse.json({ error: '선생님 정보를 찾을 수 없습니다.' }, { status: 404 })

  const student = await prisma.student.findFirst({
    where: { id, teacherId: teacher.id },
    include: { user: { select: { id: true, supabaseId: true } } },
  })
  if (!student) return NextResponse.json({ error: '학생을 찾을 수 없습니다.' }, { status: 404 })

  // 퇴원 시 Supabase Auth 계정 비활성화 (재원 복귀 시 재생성)
  if (status === 'withdrawn' && student.user.supabaseId) {
    await supabaseAdmin.auth.admin.updateUserById(student.user.supabaseId, { ban_duration: '876600h' })
  } else if (status === 'active' && student.user.supabaseId) {
    await supabaseAdmin.auth.admin.updateUserById(student.user.supabaseId, { ban_duration: 'none' })
  }

  const updated = await prisma.student.update({ where: { id }, data: { status } })
  return NextResponse.json({ ok: true, status: updated.status })
}

// DELETE /api/students/[id] — 학생 완전 삭제 (연관 데이터 전체 cascade)
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser(req)
  if (!auth || auth.role !== 'teacher') {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  const { id } = await params

  // 본인 담당 학생인지 확인
  const teacher = await prisma.teacher.findUnique({ where: { userId: auth.sub } })
  if (!teacher) return NextResponse.json({ error: '선생님 정보를 찾을 수 없습니다.' }, { status: 404 })

  const student = await prisma.student.findFirst({
    where: { id, teacherId: teacher.id },
    include: { user: { select: { id: true, supabaseId: true } } },
  })
  if (!student) return NextResponse.json({ error: '학생을 찾을 수 없습니다.' }, { status: 404 })

  // Supabase Auth 계정 삭제 (있는 경우)
  if (student.user.supabaseId) {
    await supabaseAdmin.auth.admin.deleteUser(student.user.supabaseId)
  }

  // User 삭제 → Student, WorksheetDistribution, WorksheetResult, MissionResult 모두 cascade 삭제
  await prisma.user.delete({ where: { id: student.user.id } })

  return NextResponse.json({ ok: true })
}
