import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/db'

// GET /api/textbooks/[id]/results/[studentId] — 학생 1명의 오답 번호 목록
//
// 교재 개요(GET /api/textbooks/[id])는 학생별 오답 "개수"만 내려준다.
// 3000문제 교재에서 전체 학생의 오답 배열을 한꺼번에 보내면 수 MB가 되기 때문에,
// 채점 화면에서 선택한 학생 것만 이 라우트로 따로 가져온다.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; studentId: string }> }
) {
  const auth = await getAuthUser(req)
  if (!auth || auth.role !== 'teacher') {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }
  const { id, studentId } = await params

  const teacher = await prisma.teacher.findUnique({ where: { userId: auth.sub } })
  if (!teacher) return NextResponse.json({ error: '선생님 정보를 찾을 수 없습니다.' }, { status: 404 })

  const textbook = await prisma.textbook.findFirst({ where: { id, teacherId: teacher.id } })
  if (!textbook) return NextResponse.json({ error: '교재를 찾을 수 없습니다.' }, { status: 404 })

  const student = await prisma.student.findFirst({ where: { id: studentId, teacherId: teacher.id } })
  if (!student) return NextResponse.json({ error: '학생을 찾을 수 없습니다.' }, { status: 404 })

  const result = await prisma.textbookResult.findUnique({
    where: { textbookId_studentId: { textbookId: id, studentId } },
    select: { wrongProblemsJson: true, submittedAt: true, gradedBy: true },
  })

  if (!result) return NextResponse.json({ wrongProblems: [], submittedAt: null })

  let wrongProblems: number[] = []
  try { wrongProblems = JSON.parse(result.wrongProblemsJson) } catch { /* 손상된 값은 빈 배열로 */ }

  return NextResponse.json({
    wrongProblems,
    submittedAt: result.submittedAt,
    gradedBy: result.gradedBy,
  })
}