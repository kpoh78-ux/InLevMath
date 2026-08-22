/**
 * apps/web/src/lib/knowledgeGraph.ts
 * 수학 지식 그래프 (DAG) 및 선수 결손 역추적 엔진 (PostgreSQL Recursive CTE & Fast In-Memory DAG)
 */

import { prisma } from './db.ts'

export interface ConceptItem {
  id: string
  code: string
  title: string
  domain: string
  gradeLevel: 'ELEMENTARY' | 'MIDDLE' | 'HIGH'
  gradeLabel: string
  semester: number
  description?: string
  depth?: number
  path?: string[]
  weight?: number
  confidenceScore?: number
}

export interface DeficitDiagnosisResult {
  rootDeficitNode: {
    id: string
    code: string
    title: string
    gradeLevel: string
  }
  backtrackDepth: number
  causalPath: string[] // 역추적 경로 (예: 이차부등식 -> 판별식 -> 인수분해)
}

export interface DeficitTraceResult {
  targetConcept: ConceptItem
  rootCauseConcept: ConceptItem
  prerequisitePath: ConceptItem[]
  allPrerequisites: ConceptItem[]
  diagnosisReport: string
  recommendedClinicNodes: ConceptItem[]
  latencyMs: number
}

/**
 * 선수 개념 역추적 탐색기 (Prerequisite Deficit Backtracking Tracer)
 * PostgreSQL Recursive CTE 쿼리로 선수 개념 체인 탐색
 */
export async function traceRootPrerequisiteDeficit(
  failedConceptId: string,
  maxDepth = 4
): Promise<DeficitDiagnosisResult> {
  try {
    const rawPath: any[] = await prisma.$queryRaw`
      WITH RECURSIVE ConceptTree AS (
        SELECT 
          c.id, 
          c.code, 
          c.title, 
          c."gradeLevel",
          ARRAY[c.title]::text[] AS path,
          1 AS depth
        FROM "ConceptNode" c
        WHERE c.id = ${failedConceptId} OR c.code = ${failedConceptId}

        UNION ALL

        SELECT 
          parent.id, 
          parent.code, 
          parent.title, 
          parent."gradeLevel",
          array_append(ct.path, parent.title),
          ct.depth + 1
        FROM "ConceptNode" parent
        INNER JOIN "ConceptDependency" dep ON dep."prerequisiteId" = parent.id
        INNER JOIN ConceptTree ct ON dep."successorId" = ct.id
        WHERE ct.depth < ${maxDepth}
      )
      SELECT * FROM ConceptTree ORDER BY depth DESC LIMIT 1;
    `

    if (rawPath && rawPath.length > 0) {
      const deepest = rawPath[0]
      return {
        rootDeficitNode: {
          id: deepest.id,
          code: deepest.code,
          title: deepest.title,
          gradeLevel: deepest.gradeLevel,
        },
        backtrackDepth: deepest.depth,
        causalPath: deepest.path,
      }
    }

    if ('conceptNode' in prisma && typeof (prisma as any).conceptNode?.findUnique === 'function') {
      const current = await (prisma as any).conceptNode.findUnique({
        where: { id: failedConceptId },
      })
      if (current) {
        return {
          rootDeficitNode: {
            id: current.id,
            code: current.code,
            title: current.title,
            gradeLevel: current.gradeLevel,
          },
          backtrackDepth: 1,
          causalPath: [current.title],
        }
      }
    }
  } catch {
    // DB 테이블 미생성 시 인메모리 DAG 폴백
  }

  // 인메모리 DAG 폴백
  const memTraced = tracePrerequisiteDeficitsInMemory(failedConceptId, maxDepth)
  if (memTraced.length === 0) {
    return {
      rootDeficitNode: {
        id: failedConceptId,
        code: failedConceptId,
        title: '미분류 개념',
        gradeLevel: 'MIDDLE',
      },
      backtrackDepth: 0,
      causalPath: [failedConceptId],
    }
  }

  const deepestMem = memTraced[memTraced.length - 1]
  return {
    rootDeficitNode: {
      id: deepestMem.id,
      code: deepestMem.code,
      title: deepestMem.title,
      gradeLevel: deepestMem.gradeLevel,
    },
    backtrackDepth: deepestMem.depth || 1,
    causalPath: memTraced.map((m) => m.title),
  }
}


// ─── 표준 교육과정 수학 지식 그래프 DAG 데이터셋 (초3 ~ 고3 핵심 맵) ────────
export const STANDARD_MATH_DAG: {
  nodes: ConceptItem[]
  edges: { prerequisiteCode: string; successorCode: string; weight: number; dependencyType: string }[]
} = {
  nodes: [
    // ── 초등 (ELEMENTARY) ──
    {
      id: 'NODE-ELEM-001',
      code: 'MATH-E-FRAC-001',
      title: '분수의 덧셈과 뺄셈',
      domain: '수와 연산',
      gradeLevel: 'ELEMENTARY',
      gradeLabel: '초5-1',
      semester: 1,
      description: '통분을 이용한 이분모 분수의 덧셈과 뺄셈',
    },
    {
      id: 'NODE-ELEM-002',
      code: 'MATH-E-RATIO-002',
      title: '비와 비율, 비례식',
      domain: '수와 연산',
      gradeLevel: 'ELEMENTARY',
      gradeLabel: '초6-1',
      semester: 1,
      description: '두 양의 크기 비교와 비례식의 성질',
    },

    // ── 중1 (MIDDLE) ──
    {
      id: 'NODE-MID1-001',
      code: 'MATH-M1-NUM-001',
      title: '정수와 유리수의 사칙연산',
      domain: '수와 연산',
      gradeLevel: 'MIDDLE',
      gradeLabel: '중1-1',
      semester: 1,
      description: '부호가 있는 수의 덧셈, 뺄셈, 곱셈, 나눗셈',
    },
    {
      id: 'NODE-MID1-002',
      code: 'MATH-M1-ALG-002',
      title: '문자의 사용과 식의 계산',
      domain: '문자와 식',
      gradeLevel: 'MIDDLE',
      gradeLabel: '중1-1',
      semester: 1,
      description: '동류항의 정리 및 일차식의 덧셈과 뺄셈',
    },
    {
      id: 'NODE-MID1-003',
      code: 'MATH-M1-EQN-003',
      title: '일차방정식의 풀이와 활용',
      domain: '문자와 식',
      gradeLevel: 'MIDDLE',
      gradeLabel: '중1-1',
      semester: 1,
      description: '이항과 등식의 성질을 이용한 방정식 해결',
    },
    {
      id: 'NODE-MID1-004',
      code: 'MATH-M1-COORD-004',
      title: '좌표평면과 그래프',
      domain: '함수',
      gradeLevel: 'MIDDLE',
      gradeLabel: '중1-1',
      semester: 1,
      description: '순서쌍과 좌표, 정비례와 반비례 관계',
    },

    // ── 중2 (MIDDLE) ──
    {
      id: 'NODE-MID2-001',
      code: 'MATH-M2-EXP-001',
      title: '지수법칙과 다항식의 계산',
      domain: '문자와 식',
      gradeLevel: 'MIDDLE',
      gradeLabel: '중2-1',
      semester: 1,
      description: '단항식과 다항식의 곱셈과 나눗셈',
    },
    {
      id: 'NODE-MID2-002',
      code: 'MATH-M2-INEQ-002',
      title: '일차부등식의 성질과 풀이',
      domain: '문자와 식',
      gradeLevel: 'MIDDLE',
      gradeLabel: '중2-1',
      semester: 1,
      description: '부등식의 기본 성질과 음수를 곱할 때의 부호 역전',
    },
    {
      id: 'NODE-MID2-003',
      code: 'MATH-M2-SYSEQ-003',
      title: '연립일차방정식 (가감법/대입법)',
      domain: '문자와 식',
      gradeLevel: 'MIDDLE',
      gradeLabel: '중2-1',
      semester: 1,
      description: '미지수가 2개인 일차방정식의 연립 해법',
    },
    {
      id: 'NODE-MID2-004',
      code: 'MATH-M2-FUNC-004',
      title: '일차함수와 그래프의 성질',
      domain: '함수',
      gradeLevel: 'MIDDLE',
      gradeLabel: '중2-1',
      semester: 1,
      description: '기울기, x절편, y절편과 평행이동',
    },

    // ── 중3 (MIDDLE) ──
    {
      id: 'NODE-MID3-001',
      code: 'MATH-M3-ROOT-001',
      title: '제곱근의 성질과 무리수',
      domain: '수와 연산',
      gradeLevel: 'MIDDLE',
      gradeLabel: '중3-1',
      semester: 1,
      description: '실수 체계와 근호를 포함한 식의 계산',
    },
    {
      id: 'NODE-MID3-002',
      code: 'MATH-M3-POLY-002',
      title: '다항식의 인수분해 공식',
      domain: '문자와 식',
      gradeLevel: 'MIDDLE',
      gradeLabel: '중3-1',
      semester: 1,
      description: '공통인수 묶기, 완전제곱식 및 크로스 인수분해',
    },
    {
      id: 'NODE-MID3-003',
      code: 'MATH-M3-QEQ-003',
      title: '이차방정식의 풀이 (인수분해/근의공식)',
      domain: '문자와 식',
      gradeLevel: 'MIDDLE',
      gradeLabel: '중3-1',
      semester: 1,
      description: '완전제곱식과 근의 공식을 이용한 이차방정식 해법',
    },
    {
      id: 'NODE-MID3-004',
      code: 'MATH-M3-QFUNC-004',
      title: '이차함수의 그래프와 표준형 변환',
      domain: '함수',
      gradeLevel: 'MIDDLE',
      gradeLabel: '중3-1',
      semester: 1,
      description: 'y=a(x-p)^2+q 꼴로 표준형 변환 및 꼭짓점 파악',
    },

    // ── 고1 (HIGH) ──
    {
      id: 'NODE-HIGH1-001',
      code: 'MATH-H1-POLY-001',
      title: '다항식의 연산과 항등식/나머지정리',
      domain: '문자와 식',
      gradeLevel: 'HIGH',
      gradeLabel: '고1-1',
      semester: 1,
      description: '조립제법과 고차식의 인수분해',
    },
    {
      id: 'NODE-HIGH1-002',
      code: 'MATH-H1-COMP-002',
      title: '복소수와 이차방정식 판별식',
      domain: '문자와 식',
      gradeLevel: 'HIGH',
      gradeLabel: '고1-1',
      semester: 1,
      description: '복소수 연산과 근과 계수의 관계',
    },
    {
      id: 'NODE-HIGH1-003',
      code: 'MATH-H1-QFUNC-003',
      title: '이차방정식과 이차함수의 관계',
      domain: '함수',
      gradeLevel: 'HIGH',
      gradeLabel: '고1-1',
      semester: 1,
      description: '이차함수와 x축의 위치 관계 및 교점 판별',
    },
    {
      id: 'NODE-HIGH1-004',
      code: 'MATH-H1-FMAX-004',
      title: '이차함수의 최대와 최소 (제한된 범위)',
      domain: '함수',
      gradeLevel: 'HIGH',
      gradeLabel: '고1-1',
      semester: 1,
      description: '구간 [alpha, beta]에서의 꼭짓점 축 위치에 따른 최대최소',
    },
    {
      id: 'NODE-HIGH1-005',
      code: 'MATH-H1-QINEQ-005',
      title: '이차부등식과 연립이차부등식',
      domain: '문자와 식',
      gradeLevel: 'HIGH',
      gradeLabel: '고1-1',
      semester: 1,
      description: '이차함수의 그래프를 이용한 부등식 영역 해석',
    },
  ],

  // ── DAG 선수(Prerequisite) -> 후수(Successor) 의존성 엣지 ─────────────
  edges: [
    // 초등 -> 중1
    { prerequisiteCode: 'MATH-E-FRAC-001', successorCode: 'MATH-M1-NUM-001', weight: 0.95, dependencyType: 'STRICT' },
    { prerequisiteCode: 'MATH-E-RATIO-002', successorCode: 'MATH-M1-COORD-004', weight: 0.85, dependencyType: 'STRICT' },

    // 중1 -> 중2
    { prerequisiteCode: 'MATH-M1-NUM-001', successorCode: 'MATH-M2-EXP-001', weight: 0.9, dependencyType: 'STRICT' },
    { prerequisiteCode: 'MATH-M1-ALG-002', successorCode: 'MATH-M2-EXP-001', weight: 0.95, dependencyType: 'STRICT' },
    { prerequisiteCode: 'MATH-M1-EQN-003', successorCode: 'MATH-M2-INEQ-002', weight: 0.95, dependencyType: 'STRICT' },
    { prerequisiteCode: 'MATH-M1-EQN-003', successorCode: 'MATH-M2-SYSEQ-003', weight: 0.95, dependencyType: 'STRICT' },
    { prerequisiteCode: 'MATH-M1-COORD-004', successorCode: 'MATH-M2-FUNC-004', weight: 0.9, dependencyType: 'STRICT' },
    { prerequisiteCode: 'MATH-M2-SYSEQ-003', successorCode: 'MATH-M2-FUNC-004', weight: 0.85, dependencyType: 'SUPPLEMENTARY' },

    // 중2 -> 중3
    { prerequisiteCode: 'MATH-M2-EXP-001', successorCode: 'MATH-M3-POLY-002', weight: 0.95, dependencyType: 'STRICT' },
    { prerequisiteCode: 'MATH-M3-ROOT-001', successorCode: 'MATH-M3-QEQ-003', weight: 0.9, dependencyType: 'STRICT' },
    { prerequisiteCode: 'MATH-M3-POLY-002', successorCode: 'MATH-M3-QEQ-003', weight: 0.95, dependencyType: 'STRICT' },
    { prerequisiteCode: 'MATH-M2-FUNC-004', successorCode: 'MATH-M3-QFUNC-004', weight: 0.9, dependencyType: 'STRICT' },
    { prerequisiteCode: 'MATH-M3-POLY-002', successorCode: 'MATH-M3-QFUNC-004', weight: 0.95, dependencyType: 'STRICT' },

    // 중3 -> 고1
    { prerequisiteCode: 'MATH-M3-POLY-002', successorCode: 'MATH-H1-POLY-001', weight: 0.95, dependencyType: 'STRICT' },
    { prerequisiteCode: 'MATH-M3-QEQ-003', successorCode: 'MATH-H1-COMP-002', weight: 0.9, dependencyType: 'STRICT' },
    { prerequisiteCode: 'MATH-M3-QFUNC-004', successorCode: 'MATH-H1-QFUNC-003', weight: 0.95, dependencyType: 'STRICT' },
    { prerequisiteCode: 'MATH-H1-QFUNC-003', successorCode: 'MATH-H1-FMAX-004', weight: 0.98, dependencyType: 'STRICT' },
    { prerequisiteCode: 'MATH-M2-INEQ-002', successorCode: 'MATH-H1-FMAX-004', weight: 0.85, dependencyType: 'SUPPLEMENTARY' },
    { prerequisiteCode: 'MATH-H1-QFUNC-003', successorCode: 'MATH-H1-QINEQ-005', weight: 0.95, dependencyType: 'STRICT' },
    { prerequisiteCode: 'MATH-M2-INEQ-002', successorCode: 'MATH-H1-QINEQ-005', weight: 0.9, dependencyType: 'STRICT' },
  ],
}

/**
 * PostgreSQL Recursive CTE를 이용한 상위 선수 개념 역추적 탐색기
 */
export async function tracePrerequisiteDeficitsWithCTE(
  conceptCodeOrId: string,
  maxDepth = 5
): Promise<ConceptItem[]> {
  try {
    const rawResults = await prisma.$queryRaw<any[]>`
      WITH RECURSIVE DeficitTrace AS (
        SELECT
          c.id, c.code, c.title, c.domain, c."gradeLevel", c.semester,
          1 AS depth,
          ARRAY[c.code]::text[] AS path,
          1.0::float AS cumulative_weight
        FROM "ConceptNode" c
        WHERE c.code = ${conceptCodeOrId} OR c.id = ${conceptCodeOrId}

        UNION ALL

        SELECT
          p.id, p.code, p.title, p.domain, p."gradeLevel", p.semester,
          dt.depth + 1,
          dt.path || p.code,
          dt.cumulative_weight * d.weight
        FROM "ConceptDependency" d
        JOIN "ConceptNode" p ON d."prerequisiteId" = p.id
        JOIN DeficitTrace dt ON d."successorId" = dt.id
        WHERE dt.depth < ${maxDepth} AND NOT (p.code = ANY(dt.path))
      )
      SELECT * FROM DeficitTrace ORDER BY depth ASC;
    `
    if (rawResults && rawResults.length > 0) {
      return rawResults.map((r) => ({
        id: r.id,
        code: r.code,
        title: r.title,
        domain: r.domain,
        gradeLevel: r.gradeLevel,
        gradeLabel: `${r.gradeLevel} ${r.semester}학기`,
        semester: r.semester,
        depth: Number(r.depth),
        path: r.path,
        weight: Number(r.cumulative_weight),
      }))
    }
  } catch {
    // DB 테이블 미존재 시 인메모리 DAG 역추적 폴백
  }

  return tracePrerequisiteDeficitsInMemory(conceptCodeOrId, maxDepth)
}

/**
 * 인메모리 고속 DAG 결손 역추적 탐색기 (1ms 미만 초고속 BFS/DFS)
 */
export function tracePrerequisiteDeficitsInMemory(
  conceptCodeOrId: string,
  maxDepth = 5
): ConceptItem[] {
  const nodeMap = new Map(STANDARD_MATH_DAG.nodes.map((n) => [n.code, n]))
  const idMap = new Map(STANDARD_MATH_DAG.nodes.map((n) => [n.id, n]))

  const startNode = nodeMap.get(conceptCodeOrId) || idMap.get(conceptCodeOrId)
  if (!startNode) return []

  // successor -> prerequisites 역방향 엣지 맵 생성
  const reverseEdges = new Map<string, { prerequisiteCode: string; weight: number }[]>()
  for (const edge of STANDARD_MATH_DAG.edges) {
    if (!reverseEdges.has(edge.successorCode)) {
      reverseEdges.set(edge.successorCode, [])
    }
    reverseEdges.get(edge.successorCode)!.push({
      prerequisiteCode: edge.prerequisiteCode,
      weight: edge.weight,
    })
  }

  const results: ConceptItem[] = []
  const queue: { node: ConceptItem; depth: number; path: string[]; weight: number }[] = [
    { node: startNode, depth: 1, path: [startNode.code], weight: 1.0 },
  ]
  const visited = new Set<string>([startNode.code])

  while (queue.length > 0) {
    const current = queue.shift()!
    results.push({
      ...current.node,
      depth: current.depth,
      path: current.path,
      weight: Number(current.weight.toFixed(3)),
    })

    if (current.depth >= maxDepth) continue

    const prereqs = reverseEdges.get(current.node.code) || []
    for (const p of prereqs) {
      if (!visited.has(p.prerequisiteCode)) {
        visited.add(p.prerequisiteCode)
        const pNode = nodeMap.get(p.prerequisiteCode)
        if (pNode) {
          queue.push({
            node: pNode,
            depth: current.depth + 1,
            path: [...current.path, pNode.code],
            weight: current.weight * p.weight,
          })
        }
      }
    }
  }

  return results.sort((a, b) => (a.depth || 0) - (b.depth || 0))
}

/**
 * 결손 원인 정밀 진단 및 클리닉 처방 생성기
 */
export async function analyzeDeficitPath(
  conceptCodeOrId: string,
  maxDepth = 5
): Promise<DeficitTraceResult> {
  const t0 = performance.now()
  const tracedList = await tracePrerequisiteDeficitsWithCTE(conceptCodeOrId, maxDepth)
  const latencyMs = Number((performance.now() - t0).toFixed(2))

  if (tracedList.length === 0) {
    throw new Error(`개념 코드 '${conceptCodeOrId}'를 찾을 수 없습니다.`)
  }

  const targetConcept = tracedList[0]
  const prerequisites = tracedList.slice(1)

  // 가장 깊은 단계(선수 결손의 뿌리)와 가중치가 높은 노드를 rootCause로 선정
  const rootCause = prerequisites.length > 0
    ? [...prerequisites].sort((a, b) => (b.depth || 0) - (a.depth || 0))[0]
    : targetConcept

  // 진단 보고서 작성
  let diagnosisReport = ''
  if (prerequisites.length > 0) {
    const pathTitles = tracedList.map((c) => `[${c.gradeLabel}] ${c.title}`).join(' ➔ ')
    diagnosisReport = `【선수 결손 핀포인트 진단】\n현재 「${targetConcept.title}」 오답의 근본 원인은 이전 단계인 「${rootCause.gradeLabel} ${rootCause.title}」의 개념 결손에서 기인했습니다.\n\n` +
      `역추적 의존성 경로:\n${pathTitles}\n\n` +
      `💡 처방: 상위 심화 문제를 반복하기 전에, 선수 결손 노드인 「${rootCause.title}」 기초 클리닉 드릴 10문항을 먼저 복습할 것을 권장합니다.`
  } else {
    diagnosisReport = `「${targetConcept.title}」는 기초 단계 독립 개념입니다. 해당 단원의 핵심 공식 리마인드 드릴을 진행하세요.`
  }

  return {
    targetConcept,
    rootCauseConcept: rootCause,
    prerequisitePath: tracedList,
    allPrerequisites: prerequisites,
    diagnosisReport,
    recommendedClinicNodes: prerequisites.slice(0, 3),
    latencyMs,
  }
}
