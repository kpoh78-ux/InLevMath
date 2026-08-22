// apps/web/src/app/api/diagnostic/start/route.ts
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { selectNextItem, DIAGNOSTIC_ITEM_BANK, ItemParams } from '@/lib/irt'
import { createDiagnosticSession } from '@/lib/diagnosticStore'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const user = await getCurrentUser(req)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const { targetGrade, subjectUnit } = body

  const studentId = user.id || user.sub
  const studentName = user.name || '학습자'
  const grade = targetGrade || 'HIGH_1'
  const unit = subjectUnit || 'MATH_ALL'

  // 1. 진단 세션 생성 (DB / 인메모리 세션 스토어 연동)
  let sessionId: string
  let sessionRecord: any = null

  try {
    // Prisma에 diagnosticSession 테이블이 존재할 경우 DB 레코드 생성
    if ('diagnosticSession' in prisma && typeof (prisma as any).diagnosticSession?.create === 'function') {
      sessionRecord = await (prisma as any).diagnosticSession.create({
        data: {
          studentId,
          targetGrade: grade,
          subjectUnit: unit,
          currentTheta: 0.0,
          standardError: 1.0,
          status: 'IN_PROGRESS',
          responses: [],
        },
      })
      sessionId = sessionRecord.id
    } else {
      const { session } = createDiagnosticSession({
        studentId,
        studentName,
        targetGrade: grade,
        maxQuestions: 15,
      })
      sessionId = session.sessionId
    }
  } catch {
    const { session } = createDiagnosticSession({
      studentId,
      studentName,
      targetGrade: grade,
      maxQuestions: 15,
    })
    sessionId = session.sessionId
  }

  // 2. 초기 문항 풀 구성 및 초기 문항 선정 (난이도 0.0 기준 Fisher 정보량 최대화)
  let candidatePool: ItemParams[] = DIAGNOSTIC_ITEM_BANK

  try {
    if ('question' in prisma && typeof (prisma as any).question?.findMany === 'function') {
      const dbQuestions = await (prisma as any).question.findMany({
        where: { grade: targetGrade, status: 'ACTIVE' },
        select: {
          id: true,
          discrimination: true,
          difficulty: true,
          guessing: true,
          contentLatex: true,
          options: true,
          answer: true,
        },
      })
      if (dbQuestions && dbQuestions.length > 0) {
        candidatePool = dbQuestions.map((q: any) => ({
          id: q.id,
          discrimination: q.discrimination,
          difficulty: q.difficulty,
          guessing: q.guessing,
          contentLatex: q.contentLatex,
          problemType: Array.isArray(q.options) && q.options.length > 0 ? 'MULTIPLE_CHOICE' : 'SHORT_ANSWER',
          optionsJson: q.options,
          answer: q.answer || '',
        }))
      }
    }
  } catch {
    candidatePool = DIAGNOSTIC_ITEM_BANK
  }

  const firstItem = selectNextItem(0.0, candidatePool, new Set())

  return NextResponse.json({
    sessionId,
    step: 1,
    currentTheta: 0.0,
    standardError: 1.0,
    question: firstItem,
    problem: firstItem,
  })
}
