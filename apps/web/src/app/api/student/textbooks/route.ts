// GET /api/student/textbooks — 학생 본인에게 배정된 교재 목록
//
// 학생 앱 대시보드에서 교재 답안 입력으로 들어가는 입구다.
// 문제 수는 개수만 세고, 정답은 내려보내지 않는다.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyToken } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.split(' ')[1]
  if (!token) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload || payload.role !== 'student') {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  }

  const student = await prisma.student.findFirst({ where: { userId: payload.sub } })
  if (!student) return NextResponse.json({ error: '학생 정보 없음' }, { status: 404 })

  const assignments = await prisma.textbookAssignment.findMany({
    where: { studentId: student.id },
    orderBy: { assignedAt: 'desc' },
    select: {
      completedAt: true,
      textbook: {
        select: {
          id: true, title: true, grade: true, publisher: true,
          _count: { select: { problems: true } },
        },
      },
    },
  })

  const results = await prisma.textbookResult.findMany({
    where: { studentId: student.id, textbookId: { in: assignments.map(a => a.textbook.id) } },
    select: { textbookId: true, submittedCount: true, wrongProblemsJson: true },
  })
  const resultBy = new Map(results.map(r => [r.textbookId, r]))

  return NextResponse.json(
    assignments.map(a => {
      const r = resultBy.get(a.textbook.id)
      let wrongCount = 0
      if (r) { try { wrongCount = (JSON.parse(r.wrongProblemsJson) as number[]).length } catch { /* 무시 */ } }
      const submitted = r?.submittedCount ?? 0
      return {
        textbookId: a.textbook.id,
        title: a.textbook.title,
        grade: a.textbook.grade,
        publisher: a.textbook.publisher,
        totalProblems: a.textbook._count.problems,
        submittedCount: submitted,
        correctRate: submitted > 0 ? Math.round(((submitted - wrongCount) / submitted) * 100) : null,
        completed: a.completedAt !== null,
      }
    })
  )
}
