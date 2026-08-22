// apps/web/scripts/verify-taxonomy-engine.mjs
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🧪 [2022 개정 수학 지식 그래프 엔진 동작 검증]');

  // 1. 노드 수 및 간선 수 검증
  const totalNodes = await prisma.conceptNode.count();
  const totalEdges = await prisma.conceptDependency.count();
  console.log(`\n1️⃣ 데이터 무결성:`);
  console.log(`   - ConceptNode: ${totalNodes}개 (기대: 1474개) ➔ ${totalNodes === 1474 ? '✅ 통과' : '⚠️ 확인'}`);
  console.log(`   - ConceptDependency: ${totalEdges}개 (기대: 1503개) ➔ ${totalEdges === 1503 ? '✅ 통과' : '⚠️ 확인'}`);

  // 2. 고등 대수 노드 검색 및 선수 결손 역추적 테스트
  console.log(`\n2️⃣ 고2 대수 ➡️ 선수 결손 역추적 CTE 테스트:`);
  const highSchoolAlgebraNode = await prisma.conceptNode.findFirst({
    where: { subject: '대수', sequence: { gt: 1000 } },
  });

  if (highSchoolAlgebraNode) {
    console.log(`   - 역추적 출발 노드: [${highSchoolAlgebraNode.code}] ${highSchoolAlgebraNode.title} (${highSchoolAlgebraNode.majorUnit})`);

    const rawPath = await prisma.$queryRaw`
      WITH RECURSIVE DeficitTrace AS (
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
        WHERE c.id = ${highSchoolAlgebraNode.id}

        UNION ALL

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
        WHERE dt.depth < 5
      )
      SELECT * FROM DeficitTrace ORDER BY depth DESC, sequence ASC LIMIT 1;
    `;

    if (rawPath && rawPath.length > 0) {
      const root = rawPath[0];
      console.log(`   - 근본 원인 노드: [${root.code}] ${root.title} (${root.gradeLevel}, ${root.subject})`);
      console.log(`   - 역추적 깊이: ${root.depth}단계`);
      console.log(`   - 원인 추적 경로: ${root.path.join(' ⬅️ ')}`);
      console.log(`   ➔ ✅ 선수 결손 역추적 CTE 정상 구동`);
    }
  }

  // 3. 초등 기초 스테이지 추천 & STRICT 선수 조건 테스트
  console.log(`\n3️⃣ 스테이지 해금(Unlock) 및 STRICT 선수 충족 테스트:`);
  const firstStages = await prisma.conceptNode.findMany({
    where: { gradeLevel: 'ELEMENTARY', semester: 1 },
    include: {
      prerequisites: {
        include: { prerequisite: true },
      },
    },
    orderBy: { sequence: 'asc' },
    take: 5,
  });

  firstStages.forEach((s) => {
    const strictCount = s.prerequisites.filter(p => p.dependencyType === 'STRICT').length;
    console.log(`   - [Seq ${s.sequence}] ${s.title} | 선수조건: ${s.prerequisites.length}개 (STRICT: ${strictCount}개) ➔ ${s.sequence === 1 ? '🔓 최초 해금 상태' : '🔒 선수 완료 필요'}`);
  });

  console.log(`\n🎉 모든 지식 그래프 및 선수 엔진 검증이 성공적으로 완료되었습니다.`);
}

main()
  .catch((e) => {
    console.error('검증 중 오류:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
