// POST /api/students/[id]/course — 과정 전환 (학기 변경, 교재 교체)
//
// 학년 변경은 학생 정보 수정에서 자동으로 처리된다.
// 학기가 넘어가거나 교재를 새로 시작할 때는 선생님이 여기서 직접 넘긴다.
// 평균 정답률을 지우지 않고 직전 평균을 30% 몫으로 넘긴다. (lib/studentLevel.ts)

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyToken } from '@/lib/auth'
import { academyTeacher } from '@/lib/academy'
import { rolloverCourse, recalcStudentLevel } from '@/lib/studentLevel'

async function getTeacher(req: NextRequest) {
  const token = req.headers.get('authorization')?.split(' ')[1]
  if (!token) return null
  const payload = await verifyToken(token)
  if (!payload || payload.role !== 'teacher') return null
  return academyTeacher(payload.sub)
}

// body: { courseKey?: string }  — 생략하면 학생 학년을 그대로 쓴다
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const teacher = await getTeacher(req)
  if (!teacher) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const { id } = await params
  const student = await prisma.student.findFirst({
    where: { id, teacherId: teacher.id },
    select: { id: true, grade: true },
  })
  if (!student) return NextResponse.json({ error: '학생을 찾을 수 없습니다.' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const courseKey = typeof body.courseKey === 'string' && body.courseKey.trim() !== ''
    ? body.courseKey.trim().slice(0, 40)
    : student.grade

  const snapshot = await rolloverCourse(id, courseKey)
  return NextResponse.json({ ok: true, courseKey, level: snapshot })
}

// GET — 현재 레벨 상태 (과정 전환 없이 다시 계산만 한다)
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const teacher = await getTeacher(req)
  if (!teacher) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const { id } = await params
  const student = await prisma.student.findFirst({
    where: { id, teacherId: teacher.id }, select: { id: true, courseKey: true },
  })
  if (!student) return NextResponse.json({ error: '학생을 찾을 수 없습니다.' }, { status: 404 })

  const snapshot = await recalcStudentLevel(id)
  return NextResponse.json({ courseKey: student.courseKey, level: snapshot })
}
