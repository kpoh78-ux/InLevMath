import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyToken } from '@/lib/auth'

// GET /api/student/worksheets — 나에게 배포된 학습지 목록
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')?.split(' ')[1]
  if (!auth) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  const payload = await verifyToken(auth)
  if (!payload || payload.role !== 'student') return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const student = await prisma.student.findFirst({ where: { userId: payload.sub } })
  if (!student) return NextResponse.json({ error: '학생 정보 없음' }, { status: 404 })

  const distributions = await prisma.worksheetDistribution.findMany({
    where: { studentId: student.id },
    include: {
      worksheet: true,
      result: true,
    },
    orderBy: { distributedAt: 'desc' },
  })

  return NextResponse.json(distributions.map(d => ({
    distributionId: d.id,
    worksheetId: d.worksheet.id,
    title: d.worksheet.title,
    category: d.worksheet.category,
    step: d.worksheet.step,
    examSubType: d.worksheet.examSubType,
    grade: d.worksheet.grade,
    unit: d.worksheet.unit,
    totalProblems: d.worksheet.problemCount,
    status: d.status,
    distributedAt: d.distributedAt,
    correctProblems: d.result?.correctProblems ?? null,
    submittedAt: d.result?.submittedAt ?? null,
  })))
}
