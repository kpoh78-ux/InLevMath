import { NextResponse } from 'next/server'
import { checkStudentSolutionSteps } from '@/lib/stepCheck'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const { questionLatex, answerLatex, studentSolutionSteps } = await req.json()

    if (!questionLatex || !Array.isArray(studentSolutionSteps) || studentSolutionSteps.length === 0) {
      return NextResponse.json(
        { error: 'questionLatex와 studentSolutionSteps(배열)는 필수 입력값입니다.' },
        { status: 400 }
      )
    }

    const result = await checkStudentSolutionSteps(
      questionLatex,
      answerLatex,
      studentSolutionSteps
    )

    return NextResponse.json(result)
  } catch (error: any) {
    return NextResponse.json(
      { error: 'AI 수식 첨삭 처리 중 오류가 발생했습니다.', details: error?.message },
      { status: 500 }
    )
  }
}

