import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyToken } from '@/lib/auth'
import { academyTeacher } from '@/lib/academy'
import { toEntry, resolveStudentIds, WITH_STUDENTS, type RawSchedule } from './shared'

async function getTeacher(req: NextRequest) {
  const auth = req.headers.get('authorization')?.split(' ')[1]
  if (!auth) return null
  const payload = await verifyToken(auth)
  if (!payload || payload.role !== 'teacher') return null
  return academyTeacher(payload.sub)
}

// GET /api/schedule — 선생님 전체 시간표
export async function GET(req: NextRequest) {
  const teacher = await getTeacher(req)
  if (!teacher) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const schedules = await prisma.classSchedule.findMany({
    where: { teacherId: teacher.id },
    orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    include: WITH_STUDENTS,
  })
  return NextResponse.json(schedules.map(s => toEntry(s as RawSchedule)))
}

// POST /api/schedule — 수업 추가
export async function POST(req: NextRequest) {
  const teacher = await getTeacher(req)
  if (!teacher) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const { dayOfWeek, startTime, endTime, subject, grade, studentIds } = await req.json()
  if (dayOfWeek == null || !startTime || !endTime || !subject || !grade) {
    return NextResponse.json({ error: '필수 항목 누락' }, { status: 400 })
  }

  const ids = await resolveStudentIds(teacher.id, studentIds)

  const entry = await prisma.classSchedule.create({
    data: {
      teacherId: teacher.id,
      dayOfWeek: Number(dayOfWeek),
      startTime,
      endTime,
      subject,
      grade,
      students: { create: ids.map(studentId => ({ studentId })) },
    },
    include: WITH_STUDENTS,
  })
  return NextResponse.json(toEntry(entry as RawSchedule), { status: 201 })
}
