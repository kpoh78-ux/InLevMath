// apps/web/src/app/api/diagnostic/submit/route.ts
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  estimateThetaEAP,
  selectNextItem,
  UserResponse,
  DIAGNOSTIC_ITEM_BANK,
  ItemParams,
} from '@/lib/irt'
import {
  getDiagnosticSession,
  submitDiagnosticResponse,
} from '@/lib/diagnosticStore'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const {
      sessionId,
      questionId,
      problemId,
      submittedAnswer,
      isCorrect: incomingIsCorrect,
      timeSpentSec,
    } = body

    const targetQuestionId = questionId || problemId
    if (!sessionId || !targetQuestionId) {
      return NextResponse.json(
        { error: 'sessionId와 questionId(또는 problemId)는 필수 항목입니다.' },
        { status: 400 }
      )
    }

    const duration = typeof timeSpentSec === 'number' ? timeSpentSec : 45

    // ── 1. DB (Prisma) 기반 세션 조회 및 처리 시도 ────────────────────────────
    if (
      'diagnosticSession' in prisma &&
      typeof (prisma as any).diagnosticSession?.findUnique === 'function' &&
      'question' in prisma &&
      typeof (prisma as any).question?.findUnique === 'function'
    ) {
      try {
        const session = await (prisma as any).diagnosticSession.findUnique({
          where: { id: sessionId },
        })

        if (session && session.status === 'IN_PROGRESS') {
          const currentItem = await (prisma as any).question.findUnique({
            where: { id: targetQuestionId },
            select: {
              id: true,
              discrimination: true,
              difficulty: true,
              guessing: true,
              answer: true,
              contentLatex: true,
            },
          })

          if (currentItem) {
            const isCorrect =
              typeof incomingIsCorrect === 'boolean'
                ? incomingIsCorrect
                : (submittedAnswer ?? '').toString().trim() === (currentItem.answer ?? '').toString().trim()

            const existingResponses = (session.responses as any[]) || []
            const updatedResponses: UserResponse[] = [
              ...existingResponses,
              { item: currentItem, isCorrect, timeSpentSec: duration, submittedAnswer },
            ]

            // 1. EAP 신규 능력치(theta) 및 표준오차(SE) 추정
            const { theta: newTheta, standardError: newSE } = estimateThetaEAP(updatedResponses)

            // 2. 적응형 종료 조건 판별 (12문항 이상 도달 or SE ≤ 0.28 수렴)
            const isFinished = updatedResponses.length >= 12 || newSE <= 0.28

            if (isFinished) {
              await (prisma as any).diagnosticSession.update({
                where: { id: sessionId },
                data: {
                  status: 'COMPLETED',
                  currentTheta: newTheta,
                  standardError: newSE,
                  responses: updatedResponses,
                  completedAt: new Date(),
                },
              })

              return NextResponse.json({
                isFinished: true,
                isCompleted: true,
                finalTheta: newTheta,
                updatedTheta: newTheta,
                standardError: newSE,
                totalCount: updatedResponses.length,
              })
            }

            // 3. 다음 최적 문항 선정
            const administeredIds = new Set(updatedResponses.map((r) => r.item.id))
            const candidatePool = await (prisma as any).question.findMany({
              where: { status: 'ACTIVE' },
              select: {
                id: true,
                discrimination: true,
                difficulty: true,
                guessing: true,
                contentLatex: true,
                options: true,
              },
            })

            const nextQuestion = selectNextItem(newTheta, candidatePool, administeredIds)

            await (prisma as any).diagnosticSession.update({
              where: { id: sessionId },
              data: {
                currentTheta: newTheta,
                standardError: newSE,
                responses: updatedResponses,
              },
            })

            return NextResponse.json({
              isFinished: false,
              isCompleted: false,
              step: updatedResponses.length + 1,
              currentTheta: newTheta,
              updatedTheta: newTheta,
              standardError: newSE,
              nextQuestion,
              nextProblem: nextQuestion,
            })
          }
        }
      } catch {
        // DB 테이블 미생성 또는 오류 시 인메모리 스토어로 폴백
      }
    }

    // ── 2. 인메모리 세션 스토어 (Fallback / Development) ──────────────────────
    const memSession = getDiagnosticSession(sessionId)
    if (!memSession || memSession.status === 'COMPLETED') {
      return NextResponse.json(
        { error: '유효하지 않거나 종료된 진단 세션입니다.' },
        { status: 400 }
      )
    }

    const result = submitDiagnosticResponse(
      sessionId,
      targetQuestionId,
      submittedAnswer !== undefined ? String(submittedAnswer) : '',
      duration
    )

    const {
      updatedTheta,
      standardError,
      isCompleted,
      nextProblem,
      responseIndex,
    } = result

    if (isCompleted) {
      return NextResponse.json({
        isFinished: true,
        isCompleted: true,
        finalTheta: updatedTheta,
        updatedTheta,
        standardError,
        totalCount: responseIndex,
      })
    }

    return NextResponse.json({
      isFinished: false,
      isCompleted: false,
      step: responseIndex + 1,
      currentTheta: updatedTheta,
      updatedTheta,
      standardError,
      nextQuestion: nextProblem,
      nextProblem,
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: '답안 제출 처리 중 오류가 발생했습니다.', details: error?.message },
      { status: 500 }
    )
  }
}
