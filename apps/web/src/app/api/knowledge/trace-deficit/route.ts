import { NextRequest, NextResponse } from 'next/server'
import { analyzeDeficitPath } from '@/lib/knowledgeGraph'

export const dynamic = 'force-dynamic'

/**
 * POST /api/knowledge/trace-deficit
 * 4단계: 수학 지식 그래프 선수 결손 역추적 및 진단 처방 API
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const { conceptCode, conceptId, maxDepth } = body

    const targetCodeOrId = conceptCode || conceptId || 'MATH-H1-FMAX-004'
    const depth = typeof maxDepth === 'number' ? maxDepth : 5

    const result = await analyzeDeficitPath(targetCodeOrId, depth)

    return NextResponse.json({
      success: true,
      data: {
        targetConcept: {
          code: result.targetConcept.code,
          title: result.targetConcept.title,
          domain: result.targetConcept.domain,
          grade: result.targetConcept.gradeLabel,
          description: result.targetConcept.description,
        },
        rootCause: {
          code: result.rootCauseConcept.code,
          title: result.rootCauseConcept.title,
          domain: result.rootCauseConcept.domain,
          grade: result.rootCauseConcept.gradeLabel,
          depth: result.rootCauseConcept.depth,
          weight: result.rootCauseConcept.weight,
        },
        dependencyPath: result.prerequisitePath.map((node) => ({
          step: node.depth,
          code: node.code,
          title: node.title,
          grade: node.gradeLabel,
          domain: node.domain,
          cumulativeWeight: node.weight,
        })),
        diagnosisCard: {
          title: '선수 개념 결손 역추적 진단 리포트',
          summary: result.diagnosisReport,
          recommendedClinicList: result.recommendedClinicNodes.map((n) => ({
            code: n.code,
            title: n.title,
            grade: n.gradeLabel,
            domain: n.domain,
          })),
        },
      },
      performance: {
        executionTimeMs: result.latencyMs,
        isUnderTargetLimit: result.latencyMs <= 10.0,
      },
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: '선수 결손 역추적 중 오류가 발생했습니다.', details: error?.message },
      { status: 500 }
    )
  }
}
