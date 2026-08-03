import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { answerImageUsage } from '@/lib/answerImageStore'

// GET /api/admin/storage — 정답 데이터 용량 현황
//
// 정답 이미지가 쌓이면 DB가 수십 GB 단위로 커지므로, 지금 어디에 얼마나
// 쌓여 있는지 확인할 수 있게 한다. storage='db'가 크면 ANSWER_IMAGE_STORAGE를
// 'supabase'로 바꿔 이후 저장분을 오브젝트 스토리지로 보내면 된다.
export async function GET(req: NextRequest) {
  const auth = await getAuthUser(req)
  if (!auth || auth.role !== 'teacher') {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  const [usage, worksheets, textbooks, problems] = await Promise.all([
    answerImageUsage(),
    prisma.worksheet.count(),
    prisma.textbook.count(),
    prisma.textbookProblem.count(),
  ])

  return NextResponse.json({
    ...usage,
    counts: { worksheets, textbooks, textbookProblems: problems },
  })
}