import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyToken } from '@/lib/auth'

function safeParseNames(raw: string): string[] {
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v : [] } catch { return [] }
}
function parseEntry(s: { studentNames: string; [key: string]: unknown }) {
  return { ...s, studentNames: safeParseNames(s.studentNames) }
}

async function getTeacher(req: NextRequest) {
  const auth = req.headers.get('authorization')?.split(' ')[1]
  if (!auth) return null
  const payload = await verifyToken(auth)
  if (!payload || payload.role !== 'teacher') return null
  return prisma.teacher.findFirst({ where: { userId: payload.sub } })
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

  const { dayOfWeek, startTime, endTime, subject, grade, studentNames } = await req.json()

  const updated = await prisma.classSchedule.update({
    where: { id },
    data: {
      dayOfWeek: dayOfWeek != null ? Number(dayOfWeek) : entry.dayOfWeek,
      startTime:    startTime    ?? entry.startTime,
      endTime:      endTime      ?? entry.endTime,
      subject:      subject      ?? entry.subject,
      grade:        grade        ?? entry.grade,
      studentNames: JSON.stringify(Array.isArray(studentNames) ? studentNames : JSON.parse(entry.studentNames)),
    },
  })
  return NextResponse.json(parseEntry(updated))
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
