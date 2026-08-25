// apps/web/src/lib/taxonomy.ts
// 2022 개정 수학 지식 그래프 헬퍼 및 선수 결손 역추적 & 스테이지 추천 엔진

import { prisma } from '@/lib/prisma';
import type {
  ConceptTaxonomyNode,
  StageItem,
  PrerequisiteDeficit,
  SchoolLevel,
} from '@inlevmath/shared';

export interface TaxonomyFilter {
  gradeLevel?: SchoolLevel;
  subject?: string;
  semester?: number;
  domain?: string;
  difficulty?: number;
  minSequence?: number;
  maxSequence?: number;
}

export interface RecommendStageOptions {
  studentId?: string;
  gradeLevel?: SchoolLevel;
  subject?: string;
  completedNodeCodes?: string[];
  limit?: number;
  onlyUnlocked?: boolean;
}

/**
 * 2022 개정 수학 노드 목록 조회
 */
export async function getTaxonomyNodes(filter: TaxonomyFilter = {}): Promise<ConceptTaxonomyNode[]> {
  const where: any = {};
  if (filter.gradeLevel) where.gradeLevel = filter.gradeLevel;
  if (filter.subject) where.subject = filter.subject;
  if (filter.semester) where.semester = filter.semester;
  if (filter.domain) where.domain = filter.domain;
  if (filter.difficulty) where.difficulty = filter.difficulty;
  if (filter.minSequence !== undefined || filter.maxSequence !== undefined) {
    where.sequence = {};
    if (filter.minSequence !== undefined) where.sequence.gte = filter.minSequence;
    if (filter.maxSequence !== undefined) where.sequence.lte = filter.maxSequence;
  }

  const nodes = await prisma.conceptNode.findMany({
    where,
    orderBy: { sequence: 'asc' },
  });

  return nodes.map(n => ({
    id: n.id,
    code: n.code,
    title: n.title,
    domain: n.domain,
    gradeLevel: n.gradeLevel as SchoolLevel,
    semester: n.semester,
    description: n.description,
    subject: n.subject,
    curriculum: n.curriculum,
    status: n.status,
    majorUnit: n.majorUnit,
    middleUnit: n.middleUnit,
    typeName: n.typeName,
    difficulty: n.difficulty,
    sequence: n.sequence,
    curveScore: n.curveScore,
    suggestedXp: n.suggestedXp,
    achievementStandards: n.achievementStandards,
    createdAt: n.createdAt,
  }));
}

/**
 * 고2 대수 ➡️ 중2 ➡️ 초5 실시간 선수 결손 역추적 진단 엔진
 * (PostgreSQL Recursive CTE & 선수 체인 탐색)
 */
export async function traceRootPrerequisiteDeficit(
  failedConceptIdOrCode: string,
  maxDepth = 25
): Promise<PrerequisiteDeficit> {
  try {
    const rawPath: any[] = await prisma.$queryRaw`
      WITH RECURSIVE DeficitTrace AS (
        -- Base Case: 취약점 발생 시작 노드
        SELECT 
          c.id, 
          c.code, 
          c.title, 
          c."gradeLevel",
          c.subject,
          c."majorUnit",
          c.sequence,
          ARRAY[c.title]::text[] AS path,
          1 AS depth
        FROM "ConceptNode" c
        WHERE c.id = ${failedConceptIdOrCode} OR c.code = ${failedConceptIdOrCode}

        UNION ALL

        -- Recursive Step: STRICT / 높은 가중치 선수 노드 역방향 추적
        SELECT 
          parent.id, 
          parent.code, 
          parent.title, 
          parent."gradeLevel",
          parent.subject,
          parent."majorUnit",
          parent.sequence,
          array_append(dt.path, parent.title),
          dt.depth + 1
        FROM "ConceptNode" parent
        INNER JOIN "ConceptDependency" dep ON dep."prerequisiteId" = parent.id
        INNER JOIN DeficitTrace dt ON dep."successorId" = dt.id
        WHERE dt.depth < ${maxDepth}
      )
      SELECT * FROM DeficitTrace ORDER BY depth DESC, sequence ASC LIMIT 1;
    `;

    if (rawPath && rawPath.length > 0) {
      const deepest = rawPath[0];
      
      // 추천 처방 클리닉 노드 조회 (근본 원인 노드 및 인접 선수 노드 3개)
      const clinicNodes = await prisma.conceptNode.findMany({
        where: {
          sequence: {
            gte: Math.max(1, deepest.sequence - 1),
            lte: deepest.sequence + 2,
          },
        },
        orderBy: { sequence: 'asc' },
        take: 3,
      });

      return {
        rootDeficitNode: {
          id: deepest.id,
          code: deepest.code,
          title: deepest.title,
          gradeLevel: deepest.gradeLevel,
          subject: deepest.subject || '수학',
          majorUnit: deepest.majorUnit || '',
        },
        backtrackDepth: deepest.depth,
        causalPath: deepest.path,
        recommendedClinicNodes: clinicNodes.map(n => ({
          ...n,
          gradeLevel: n.gradeLevel as SchoolLevel,
        })),
      };
    }

    // 폴백: 단일 노드 조회
    const singleNode = await prisma.conceptNode.findFirst({
      where: {
        OR: [{ id: failedConceptIdOrCode }, { code: failedConceptIdOrCode }],
      },
    });

    if (singleNode) {
      return {
        rootDeficitNode: {
          id: singleNode.id,
          code: singleNode.code,
          title: singleNode.title,
          gradeLevel: singleNode.gradeLevel,
          subject: singleNode.subject,
          majorUnit: singleNode.majorUnit,
        },
        backtrackDepth: 1,
        causalPath: [singleNode.title],
        recommendedClinicNodes: [{
          ...singleNode,
          gradeLevel: singleNode.gradeLevel as SchoolLevel,
        }],
      };
    }

    throw new Error(`개념 노드를 찾을 수 없습니다: ${failedConceptIdOrCode}`);
  } catch (error: any) {
    console.error('[traceRootPrerequisiteDeficit] Error:', error);
    throw error;
  }
}

/**
 * STRICT 선수 충족 기반 게임 스테이지 추천 & 해금(Unlock) 상태 평가
 * 
 * @example
 * recommendStages(['E1-1-01-01-01-01', 'E1-1-01-01-01-02'], 5)
 * recommendStages({ completedNodeCodes: ['E1-1-01-01-01-01'], limit: 5 })
 */
export async function recommendStages(
  clearedCodesOrOpts: string[] | RecommendStageOptions = [],
  limitCount = 5
): Promise<StageItem[]> {
  const isArray = Array.isArray(clearedCodesOrOpts);
  const completedCodes = isArray
    ? clearedCodesOrOpts
    : (clearedCodesOrOpts.completedNodeCodes || []);
  
  const limit = isArray ? limitCount : (clearedCodesOrOpts.limit || limitCount);
  const gradeLevel = !isArray ? clearedCodesOrOpts.gradeLevel : undefined;
  const subject = !isArray ? clearedCodesOrOpts.subject : undefined;
  const onlyUnlocked = !isArray ? (clearedCodesOrOpts.onlyUnlocked ?? true) : true;

  const completedSet = new Set(completedCodes);

  const where: any = {};
  if (gradeLevel) where.gradeLevel = gradeLevel;
  if (subject) where.subject = subject;

  // 전체 노드 및 해당 노드의 선수 조건 조회 (successorId = node.id 인 간선들의 prerequisite)
  const nodes = await prisma.conceptNode.findMany({
    where,
    include: {
      successors: {
        include: {
          prerequisite: {
            select: { code: true, title: true },
          },
        },
      },
    },
    orderBy: { sequence: 'asc' },
  });

  const stageItems: StageItem[] = [];

  for (const node of nodes) {
    const isCompleted = completedSet.has(node.code);

    const prerequisites = node.successors.map(dep => ({
      code: dep.prerequisite.code,
      title: dep.prerequisite.title,
      dependencyType: dep.dependencyType as 'STRICT' | 'SUPPLEMENTARY',
      isSatisfied: completedSet.has(dep.prerequisite.code),
    }));

    // STRICT 선수 조건이 모두 완료되었거나 선수 조건이 없으면 해금(Unlocked)
    const strictPrereqs = prerequisites.filter(p => p.dependencyType === 'STRICT');
    const isUnlocked = strictPrereqs.length === 0 || strictPrereqs.every(p => p.isSatisfied);

    // 미완료 상태이면서 STRICT 선수 조건이 모두 충족된 스테이지만 선별 (또는 전체 보기 모드)
    if (onlyUnlocked) {
      if (!isCompleted && isUnlocked) {
        stageItems.push({
          node: {
            id: node.id,
            code: node.code,
            title: node.title,
            domain: node.domain,
            gradeLevel: node.gradeLevel as SchoolLevel,
            semester: node.semester,
            description: node.description,
            subject: node.subject,
            status: node.status,
            majorUnit: node.majorUnit,
            middleUnit: node.middleUnit,
            typeName: node.typeName,
            difficulty: node.difficulty,
            sequence: node.sequence,
            curveScore: node.curveScore,
            suggestedXp: node.suggestedXp,
            achievementStandards: node.achievementStandards,
            createdAt: node.createdAt,
          },
          isUnlocked,
          isCompleted,
          prerequisites,
        });
      }
    } else {
      stageItems.push({
        node: {
          id: node.id,
          code: node.code,
          title: node.title,
          domain: node.domain,
          gradeLevel: node.gradeLevel as SchoolLevel,
          semester: node.semester,
          description: node.description,
          subject: node.subject,
          status: node.status,
          majorUnit: node.majorUnit,
          middleUnit: node.middleUnit,
          typeName: node.typeName,
          difficulty: node.difficulty,
          sequence: node.sequence,
          curveScore: node.curveScore,
          suggestedXp: node.suggestedXp,
          achievementStandards: node.achievementStandards,
          createdAt: node.createdAt,
        },
        isUnlocked,
        isCompleted,
        prerequisites,
      });
    }

    if (stageItems.length >= limit) {
      break;
    }
  }

  return stageItems;
}
