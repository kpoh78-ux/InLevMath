import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { academyTeacher } from '@/lib/academy'
import { getStudentWeaknessRadarData, getStudentHierarchyStats } from '@/lib/statAggregator'
import type { MathGradeSubject } from '@prisma/client'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthUser(req)
  if (!auth) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  const { id: studentId } = await params

  // 교사이거나 본인(학생)인 경우 조회 허용
  if (auth.role === 'teacher') {
    const teacher = await academyTeacher(auth.sub)
    if (!teacher) return NextResponse.json({ error: '선생님 정보를 찾을 수 없습니다.' }, { status: 404 })
    const student = await prisma.student.findFirst({
      where: { id: studentId, teacherId: teacher.id },
      select: { id: true, user: { select: { name: true } } },
    })
    if (!student) return NextResponse.json({ error: '학생을 찾을 수 없습니다.' }, { status: 404 })
  } else if (auth.role === 'student') {
    const student = await prisma.student.findFirst({
      where: { userId: auth.sub },
      select: { id: true },
    })
    if (!student || student.id !== studentId) {
      return NextResponse.json({ error: '접근 권한이 없습니다.' }, { status: 403 })
    }
  }

  const url = new URL(req.url)
  const subjectParam = url.searchParams.get('subject') as MathGradeSubject | null

  try {
    const [radarAndWeakness, hierarchy] = await Promise.all([
      getStudentWeaknessRadarData(studentId),
      getStudentHierarchyStats(studentId, subjectParam || undefined),
    ])

    return NextResponse.json({
      radarData: radarAndWeakness.radarData,
      weaknesses: radarAndWeakness.weaknesses,
      summary: radarAndWeakness.summary,
      hierarchy,
    })
  } catch (error) {
    console.error('Failed to get student unit stats:', error)
    return NextResponse.json({ error: '통계 데이터를 불러오는 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
