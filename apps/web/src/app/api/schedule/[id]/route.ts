import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyToken } from '@/lib/auth'
import { academyTeacher } from '@/lib/academy'
import { toEntry, resolveStudentIds, WITH_STUDENTS, type RawSchedule } from '../shared'

async function getTeacher(req: NextRequest) {
  const auth = req.headers.get('authorization')?.split(' ')[1]
  if (!auth) return null
  const payload = await verifyToken(auth)
  if (!payload || payload.role !== 'teacher') return null
  return academyTeacher(payload.sub)
}

// PUT /api/schedule/[id] — 수업 수정
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const teacher = await getTeacher(req)
  if (!teacher) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const { id } = await params
  const entry = await prisma.classSchedule.findFirst({ where: { id, teacherId: teacher.id } })
  if (!entry) return NextResponse.json({ error: '항목 없음' }, { status: 404 })

  const { dayOfWeek, startTime, endTime, subject, grade, studentIds } = await req.json()

  // studentIds 를 아예 안 보내면 학생 명단은 건드리지 않는다.
  // 빈 배열은 "전부 뺀다"는 뜻이므로 undefined 와 구분해야 한다.
  const touchStudents = Array.isArray(studentIds)
  const ids = touchStudents ? await resolveStudentIds(teacher.id, studentIds) : []

  const updated = await prisma.classSchedule.update({
    where: { id },
    data: {
      dayOfWeek: dayOfWeek != null ? Number(dayOfWeek) : entry.dayOfWeek,
      startTime: startTime ?? entry.startTime,
      endTime:   endTime   ?? entry.endTime,
      subject:   subject   ?? entry.subject,
      grade:     grade     ?? entry.grade,
      ...(touchStudents
        ? { students: { deleteMany: {}, create: ids.map(studentId => ({ studentId })) } }
        : {}),
    },
    include: WITH_STUDENTS,
  })
  return NextResponse.json(toEntry(updated as RawSchedule))
}

// DELETE /api/schedule/[id] — 수업 삭제
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const teacher = await getTeacher(req)
  if (!teacher) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const { id } = await params
  const entry = await prisma.classSchedule.findFirst({ where: { id, teacherId: teacher.id } })
  if (!entry) return NextResponse.json({ error: '항목 없음' }, { status: 404 })

  await prisma.classSchedule.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
