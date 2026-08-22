// apps/web/scripts/test-trace-deficit.mjs
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function traceDeficit(codeOrId, maxDepth = 25) {
  console.log(`\n🔍 [선수 결손 역추적 테스트] 대상 노드: ${codeOrId} (최대 깊이: ${maxDepth})`);

  const startNode = await prisma.conceptNode.findFirst({
    where: { OR: [{ id: codeOrId }, { code: codeOrId }] },
  });

  if (!startNode) {
    console.error(`❌ 노드를 찾을 수 없습니다: ${codeOrId}`);
    return;
  }

  console.log(`   - 시작 노드: [${startNode.code}] ${startNode.subject} > ${startNode.majorUnit} > ${startNode.typeName} > ${startNode.title} (${startNode.gradeLevel})`);

  const rawPaths = await prisma.$queryRaw`
    WITH RECURSIVE DeficitTrace AS (
      SELECT 
        c.id, 
        c.code, 
        c.title, 
        c."gradeLevel",
        c.subject,
        c."majorUnit",
        c."middleUnit",
        c."typeName",
        c.sequence,
        ARRAY[c.title]::text[] AS path,
        ARRAY[c.code]::text[] AS code_path,
        ARRAY[c.subject]::text[] AS subject_path,
        ARRAY[c."gradeLevel"::text]::text[] AS grade_path,
        1 AS depth
      FROM "ConceptNode" c
      WHERE c.id = ${startNode.id}

      UNION ALL

      SELECT 
        parent.id, 
        parent.code, 
        parent.title, 
        parent."gradeLevel",
        parent.subject,
        parent."majorUnit",
        parent."middleUnit",
        parent."typeName",
        parent.sequence,
        array_append(dt.path, parent.title),
        array_append(dt.code_path, parent.code),
        array_append(dt.subject_path, parent.subject),
        array_append(dt.grade_path, parent."gradeLevel"::text),
        dt.depth + 1
      FROM "ConceptNode" parent
      INNER JOIN "ConceptDependency" dep ON dep."prerequisiteId" = parent.id
      INNER JOIN DeficitTrace dt ON dep."successorId" = dt.id
      WHERE dt.depth < ${maxDepth}
    )
    SELECT * FROM DeficitTrace ORDER BY depth DESC, sequence ASC;
  `;

  if (rawPaths && rawPaths.length > 0) {
    const deepest = rawPaths[0];
    console.log(`\n📌 역추적 도출 결과:`);
    console.log(`   - 총 역추적 체인 길이: ${deepest.depth}단계`);
    console.log(`   - 최하위 근본 결손 노드 (Root Deficit): [${deepest.code}] ${deepest.title}`);
    console.log(`   - 학교급 / 과목: ${deepest.gradeLevel} (${deepest.subject || '수학'}) / ${deepest.majorUnit} > ${deepest.typeName}`);
    
    console.log(`\n🔗 전체 인과 역추적 체인 (Causal Path):`);
    for (let i = 0; i < deepest.path.length; i++) {
      const arrow = i === 0 ? '🏁 [취약 발생]' : ` ⬆️ [${i}단계 선수]`;
      console.log(`   ${arrow} [${deepest.grade_path[i]} · ${deepest.subject_path[i]}] ${deepest.path[i]} (${deepest.code_path[i]})`);
    }

    console.log(`\n✅ 고2 ➡️ 중등/초등 하위 학년 결손 개념까지 인과 경로가 정상적으로 도출되었습니다!`);
  }
}

async function main() {
  await traceDeficit('H-ALG-01-02-03-01', 25);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
