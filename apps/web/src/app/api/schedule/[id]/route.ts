import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getTeacherAuth } from '@/lib/teacherAuth'
import {
  toEntry,
  resolveStudentIds,
  resolveOwnerTeacherId,
  WITH_SCHEDULE_RELATIONS,
  type RawSchedule,
} from '../shared'

const NOT_MINE = '내 시간표만 수정할 수 있습니다. 다른 선생님 수업은 관리자에게 요청하세요.'

/** 이 수업을 고칠 수 있는지 확인한다 */
async function loadEditable(req: NextRequest, id: string) {
  const me = await getTeacherAuth(req)
  if (!me) return { error: NextResponse.json({ error: '권한 없음' }, { status: 403 }) }

  const entry = await prisma.classSchedule.findUnique({ where: { id } })
  if (!entry) return { error: NextResponse.json({ error: '항목 없음' }, { status: 404 }) }

  if (entry.teacherId !== me.teacherId && !me.isAdmin) {
    return { error: NextResponse.json({ error: NOT_MINE }, { status: 403 }) }
  }
  return { me, entry }
}

// PUT /api/schedule/[id] — 수업 수정
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const found = await loadEditable(req, id)
  if ('error' in found) return found.error
  const { me, entry } = found

  const { dayOfWeek, startTime, endTime, subject, grade, studentIds, teacherId } = await req.json()

  // 담당 선생님 변경은 관리자만
  let ownerId = entry.teacherId
  if (typeof teacherId === 'string' && teacherId !== '' && teacherId !== entry.teacherId) {
    const resolved = await resolveOwnerTeacherId(me, teacherId)
    if (!resolved) {
      return NextResponse.json({ error: '담당 선생님 변경은 관리자만 할 수 있습니다.' }, { status: 403 })
    }
    ownerId = resolved
  }

  // studentIds 를 아예 안 보내면 학생 명단은 건드리지 않는다.
  // 빈 배열은 "전부 뺀다"는 뜻이므로 undefined 와 구분해야 한다.
  const touchStudents = Array.isArray(studentIds)
  const ids = touchStudents ? await resolveStudentIds(studentIds) : []

  const updated = await prisma.classSchedule.update({
    where: { id },
    data: {
      teacherId: ownerId,
      dayOfWeek: dayOfWeek != null ? Number(dayOfWeek) : entry.dayOfWeek,
      startTime: startTime ?? entry.startTime,
      endTime:   endTime   ?? entry.endTime,
      subject:   subject   ?? entry.subject,
      grade:     grade     ?? entry.grade,
      ...(touchStudents
        ? { students: { deleteMany: {}, create: ids.map(studentId => ({ studentId })) } }
        : {}),
    },
    include: WITH_SCHEDULE_RELATIONS,
  })
  return NextResponse.json(toEntry(updated as RawSchedule, me))
}

// DELETE /api/schedule/[id] — 수업 삭제
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const found = await loadEditable(req, id)
  if ('error' in found) return found.error

  await prisma.classSchedule.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
