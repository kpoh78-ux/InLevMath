import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getTeacherAuth } from '@/lib/teacherAuth'
import {
  toEntry,
  resolveStudentIds,
  resolveOwnerTeacherId,
  WITH_SCHEDULE_RELATIONS,
  type RawSchedule,
} from './shared'

// GET /api/schedule — 학원 전체 시간표 + 선생님 명단
//
// 목록은 학원 전체를 준다. 한 학생이 여러 선생님 수업을 들을 수 있어서
// 화면에서도 그날 수업 전체가 보여야 한다. 각 항목의 mine/canEdit 으로
// 내 수업과 남의 수업을 구분한다.
export async function GET(req: NextRequest) {
  const me = await getTeacherAuth(req)
  if (!me) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const [schedules, teachers] = await Promise.all([
    prisma.classSchedule.findMany({
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
      include: WITH_SCHEDULE_RELATIONS,
    }),
    prisma.teacher.findMany({
      select: { id: true, isAdmin: true, teachesClasses: true, user: { select: { name: true } } },
      orderBy: { user: { createdAt: 'asc' } },
    }),
  ])

  return NextResponse.json({
    me: { teacherId: me.teacherId, name: me.name, isAdmin: me.isAdmin },
    teachers: teachers.map(t => ({
      id: t.id, name: t.user.name, isAdmin: t.isAdmin,
      // 수업을 맡지 않는 관리 전용 계정은 시간표 화면에서 감춘다
      teachesClasses: t.teachesClasses,
    })),
    schedules: schedules.map(s => toEntry(s as RawSchedule, me)),
  })
}

// POST /api/schedule — 수업 추가 (기본 소유자는 로그인한 본인)
export async function POST(req: NextRequest) {
  const me = await getTeacherAuth(req)
  if (!me) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const { dayOfWeek, startTime, endTime, subject, grade, studentIds, teacherId } = await req.json()
  if (dayOfWeek == null || !startTime || !endTime || !subject || !grade) {
    return NextResponse.json({ error: '필수 항목 누락' }, { status: 400 })
  }

  const ownerId = await resolveOwnerTeacherId(me, teacherId)
  if (!ownerId) {
    return NextResponse.json({ error: '다른 선생님의 시간표는 관리자만 만들 수 있습니다.' }, { status: 403 })
  }

  const ids = await resolveStudentIds(studentIds)

  const entry = await prisma.classSchedule.create({
    data: {
      teacherId: ownerId,
      dayOfWeek: Number(dayOfWeek),
      startTime,
      endTime,
      subject,
      grade,
      students: { create: ids.map(studentId => ({ studentId })) },
    },
    include: WITH_SCHEDULE_RELATIONS,
  })
  return NextResponse.json(toEntry(entry as RawSchedule, me), { status: 201 })
}
