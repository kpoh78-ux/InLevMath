import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/db'

// POST /api/teacher/grade/textbook/[textbookId]
// body: { studentId, wrongProblems: number[] }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ textbookId: string }> }
) {
  const auth = await getAuthUser(req)
  if (!auth || auth.role !== 'teacher') {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }
  const { textbookId } = await params
  const { studentId, wrongProblems } = await req.json() as {
    studentId: string; wrongProblems: number[]
  }

  const teacher = await prisma.teacher.findUnique({ where: { userId: auth.sub } })
  if (!teacher) return NextResponse.json({ error: '선생님 정보를 찾을 수 없습니다.' }, { status: 404 })

  const textbook = await prisma.textbook.findFirst({
    where: { id: textbookId, teacherId: teacher.id },
    include: { problems: true },
  })
  if (!textbook) return NextResponse.json({ error: '교재를 찾을 수 없습니다.' }, { status: 404 })

  const student = await prisma.student.findFirst({
    where: { id: studentId, teacherId: teacher.id },
  })
  if (!student) return NextResponse.json({ error: '학생을 찾을 수 없습니다.' }, { status: 404 })

  const totalProblems = textbook.problems.length
  const validWrong = wrongProblems.filter(n => n >= 1 && n <= totalProblems)
  const wrongProblemsJson = JSON.stringify(validWrong.sort((a, b) => a - b))
  const correctCount = totalProblems - validWrong.length
  const rate = totalProblems > 0 ? correctCount / totalProblems : 0

  // 교재는 종합 가중치로 능력치 업데이트
  const gain = rate * 8
  const dComp = 0.35 * gain
  const dReas = 0.35 * gain
  const dCalc = 0.30 * gain

  const [, updatedStudent] = await prisma.$transaction([
    prisma.textbookResult.upsert({
      where: { textbookId_studentId: { textbookId, studentId } },
      create: { textbookId, studentId, wrongProblemsJson, gradedBy: 'teacher' },
      update: { wrongProblemsJson, gradedBy: 'teacher', submittedAt: new Date() },
    }),
    prisma.student.update({
      where: { id: studentId },
      data: {
        comprehension: { increment: dComp },
        reasoning:     { increment: dReas },
        calculation:   { increment: dCalc },
      },
    }),
    prisma.missionResult.create({
      data: {
        studentId,
        missionType: 'advanced_problem',
        totalProblems,
        correctProblems: correctCount,
        source: 'manual',
        solvedAt: new Date(),
      },
    }),
  ])

  return NextResponse.json({
    correctProblems: correctCount,
    totalProblems,
    correctRate: Math.round(rate * 100),
    wrongProblems: validWrong,
    newAbility: {
      comprehension: updatedStudent.comprehension,
      reasoning: updatedStudent.reasoning,
      calculation: updatedStudent.calculation,
    },
  })
}
