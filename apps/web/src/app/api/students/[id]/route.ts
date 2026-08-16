import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { supabaseAdmin, phoneToEmail } from '@/lib/supabase'
import { prisma } from '@/lib/db'
import { getTeacherAuth } from '@/lib/teacherAuth'
import { rolloverCourse } from '@/lib/studentLevel'

// PATCH /api/students/[id]
//   { status } 만 보내면 재원/퇴원 처리
//   그 외 필드를 보내면 학생 상세 정보 수정 (이름·연락처·학교·학년·주소 등)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser(req)
  if (!auth || auth.role !== 'teacher') {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  const { id } = await params
  const body = await req.json() as Record<string, unknown>
  const status = body.status as 'active' | 'withdrawn' | undefined

  const me = await getTeacherAuth(req)
  if (!me) return NextResponse.json({ error: '선생님 정보를 찾을 수 없습니다.' }, { status: 404 })

  // 퇴원 / 재원 복귀는 관리자 전용
  if (status && !me.isAdmin) {
    return NextResponse.json(
      { error: '학생 퇴원 처리는 관리자만 할 수 있습니다.' }, { status: 403 }
    )
  }

  const teacher = { id: me.teacherId }

  const student = await prisma.student.findFirst({
    where: { id, teacherId: teacher.id },
    include: { user: { select: { id: true, supabaseId: true, phone: true, name: true } } },
  })
  if (!student) return NextResponse.json({ error: '학생을 찾을 수 없습니다.' }, { status: 404 })

  // ── 재원/퇴원 처리 ──
  if (status) {
    // 퇴원 시 Supabase Auth 계정 비활성화 (재원 복귀 시 해제)
    if (status === 'withdrawn' && student.user.supabaseId) {
      await supabaseAdmin.auth.admin.updateUserById(student.user.supabaseId, { ban_duration: '876600h' })
    } else if (status === 'active' && student.user.supabaseId) {
      await supabaseAdmin.auth.admin.updateUserById(student.user.supabaseId, { ban_duration: 'none' })
    }
  }

  // ── 상세 정보 수정 ──
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : undefined)

  const studentData: Record<string, unknown> = {}
  if (status) studentData.status = status
  for (const key of ['school', 'grade', 'parentName', 'parentPhone', 'startDate',
                     'address', 'homePhone', 'birthDate', 'email', 'memo'] as const) {
    const v = str(body[key])
    if (v !== undefined) studentData[key] = v
  }

  const name = str(body.name)
  const phone = str(body.phone)

  // 핸드폰번호 = 로그인 아이디. 바꾸면 중복 확인 + Supabase 계정까지 맞춰야 한다
  if (phone !== undefined && phone !== student.user.phone) {
    if (!/^\d{11}$/.test(phone)) {
      return NextResponse.json({ error: '핸드폰번호는 11자리 숫자로 입력해주세요.' }, { status: 400 })
    }
    const dup = await prisma.user.findUnique({ where: { phone }, select: { id: true } })
    if (dup && dup.id !== student.user.id) {
      return NextResponse.json({ error: '이미 등록된 핸드폰번호입니다.' }, { status: 400 })
    }
    if (student.user.supabaseId) {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(student.user.supabaseId, {
        email: phoneToEmail(phone),
      })
      if (error) {
        return NextResponse.json(
          { error: `로그인 계정 변경에 실패했습니다: ${error.message}` }, { status: 500 }
        )
      }
    }
  }

  const userData: Record<string, unknown> = {}
  if (name) userData.name = name
  if (phone !== undefined && phone !== student.user.phone) userData.phone = phone

  const updated = await prisma.student.update({
    where: { id },
    data: {
      ...studentData,
      ...(Object.keys(userData).length > 0 ? { user: { update: userData } } : {}),
    },
    include: { user: { select: { name: true, phone: true } } },
  })

  // 학년이 바뀌면 새 과정으로 넘어간다.
  // 평균을 지우지 않고 직전 평균을 30% 몫으로 넘긴다 (lib/studentLevel.ts)
  const newGrade = str(body.grade)
  if (newGrade !== undefined && newGrade !== student.grade) {
    try {
      await rolloverCourse(id, newGrade)
    } catch (e) {
      console.error('[rolloverCourse]', e)   // 학생 정보 수정 자체는 막지 않는다
    }
  }

  return NextResponse.json({
    ok: true,
    status: updated.status,
    student: {
      id: updated.id,
      name: updated.user.name,
      phone: updated.user.phone,
      school: updated.school, grade: updated.grade,
      parentName: updated.parentName, parentPhone: updated.parentPhone,
      startDate: updated.startDate, status: updated.status,
      address: updated.address, homePhone: updated.homePhone,
      birthDate: updated.birthDate, email: updated.email, memo: updated.memo,
    },
  })
}

// DELETE /api/students/[id] — 학생 완전 삭제 (연관 데이터 전체 cascade)
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser(req)
  if (!auth || auth.role !== 'teacher') {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  const { id } = await params

  // 본인 담당 학생인지 확인 — 완전 삭제는 관리자 전용
  const me = await getTeacherAuth(req)
  if (!me) return NextResponse.json({ error: '선생님 정보를 찾을 수 없습니다.' }, { status: 404 })
  if (!me.isAdmin) {
    return NextResponse.json(
      { error: '학생 삭제는 관리자만 할 수 있습니다.' }, { status: 403 }
    )
  }
  const teacher = { id: me.teacherId }

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
