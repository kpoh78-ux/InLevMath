import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getDiagnosticSession, generateDiagnosticReport } from '@/lib/diagnosticStore'

export const dynamic = 'force-dynamic'

/**
 * GET /api/diagnostic/[sessionId]/report
 * 4단계: 최종 5각 방사형 역량 분석 리포트 생성 API
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId가 누락되었습니다.' }, { status: 400 })
    }

    let session = getDiagnosticSession(sessionId)

    if (!session && 'diagnosticSession' in prisma && typeof (prisma as any).diagnosticSession?.findUnique === 'function') {
      try {
        const dbSession = await (prisma as any).diagnosticSession.findUnique({
          where: { id: sessionId },
        })
        if (dbSession) {
          session = {
            sessionId: dbSession.id,
            studentId: dbSession.studentId,
            studentName: '학습자',
            targetGrade: dbSession.targetGrade,
            currentTheta: dbSession.currentTheta,
            standardError: dbSession.standardError,
            responses: (dbSession.responses as any[]) || [],
            status: dbSession.status,
            maxQuestions: 15,
            convergenceSE: 0.28,
            startedAt: dbSession.createdAt ? new Date(dbSession.createdAt).toISOString() : new Date().toISOString(),
            completedAt: dbSession.completedAt ? new Date(dbSession.completedAt).toISOString() : undefined,
          }
        }
      } catch {}
    }

    if (!session) {
      return NextResponse.json({ error: '진단 세션을 찾을 수 없습니다.' }, { status: 404 })
    }

    const report = generateDiagnosticReport(session)

    return NextResponse.json(report)
  } catch (error: any) {
    return NextResponse.json(
      { error: '진단 리포트 생성 중 오류가 발생했습니다.', details: error?.message },
      { status: 500 }
    )
  }
}
