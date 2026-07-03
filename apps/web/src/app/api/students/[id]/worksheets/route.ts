import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/db'

// GET /api/students/[id]/worksheets — 학생에게 배포된 학습지 목록 (선생님용)
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser(req)
  if (!auth || auth.role !== 'teacher') {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  const { id } = await params

  const teacher = await prisma.teacher.findUnique({ where: { userId: auth.sub } })
  if (!teacher) return NextResponse.json({ error: '선생님 정보를 찾을 수 없습니다.' }, { status: 404 })

  // 내 담당 학생인지 확인
  const student = await prisma.student.findFirst({
    where: { id, teacherId: teacher.id },
    include: { user: { select: { name: true } } },
  })
  if (!student) return NextResponse.json({ error: '학생을 찾을 수 없습니다.' }, { status: 404 })

  const distributions = await prisma.worksheetDistribution.findMany({
    where: { studentId: id },
    include: {
      worksheet: true,
      result: true,
    },
    orderBy: { distributedAt: 'desc' },
  })

  return NextResponse.json({
    student: { id: student.id, name: student.user.name, grade: student.grade },
    distributions: distributions.map(d => ({
      id: d.id,
      status: d.status,
      distributedAt: d.distributedAt,
      worksheet: {
        id: d.worksheet.id,
        title: d.worksheet.title,
        grade: d.worksheet.grade,
        unit: d.worksheet.unit,
        step: d.worksheet.step,
        problemCount: d.worksheet.problemCount,
        answersJson: d.worksheet.answersJson,
      },
      result: d.result ? {
        correctProblems: d.result.correctProblems,
        wrongProblemsJson: d.result.wrongProblemsJson,
        gradedBy: d.result.gradedBy,
        submittedAt: d.result.submittedAt,
      } : null,
    })),
  })
}
