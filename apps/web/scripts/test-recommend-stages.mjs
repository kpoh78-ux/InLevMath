// apps/web/scripts/test-recommend-stages.mjs
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function recommendStagesTest(completedCodes = [], limit = 5) {
  const completedSet = new Set(completedCodes);

  const nodes = await prisma.conceptNode.findMany({
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

  const recommendations = [];

  for (const node of nodes) {
    const isCompleted = completedSet.has(node.code);

    const prerequisites = node.successors.map((dep) => ({
      code: dep.prerequisite.code,
      title: dep.prerequisite.title,
      dependencyType: dep.dependencyType,
      isSatisfied: completedSet.has(dep.prerequisite.code),
    }));

    const strictPrereqs = prerequisites.filter((p) => p.dependencyType === 'STRICT');
    const isUnlocked = strictPrereqs.length === 0 || strictPrereqs.every((p) => p.isSatisfied);

    if (!isCompleted && isUnlocked) {
      recommendations.push({
        node,
        isUnlocked,
        isCompleted,
        prerequisites,
      });
    }

    if (recommendations.length >= limit) {
      break;
    }
  }

  return recommendations;
}

async function main() {
  console.log('🎮 [STRICT 선수 충족 기반 스테이지 추천 엔진 테스트]');

  // 케이스 1: 신규 학생 (완료 이력 없음 -> 최초 시작 가능한 루트 스테이지들)
  console.log('\n1️⃣ 신규 학생 (완료 이력 0개) 스테이지 추천 5개:');
  const initStages = await recommendStagesTest([], 5);
  initStages.forEach((s, idx) => {
    console.log(`   ${idx + 1}. [Seq ${s.node.sequence}] [${s.node.code}] ${s.node.title} (${s.node.subject}, 난이도: ${s.node.difficulty}) | 해금: ${s.isUnlocked ? '🔓' : '🔒'}`);
  });

  // 케이스 2: 1번~3번 스테이지 클리어 학생 (Seq 1~3 완료 후 다음 스테이지 추천)
  const cleared = ['E1-1-01-01-01-01', 'E1-1-01-01-01-02', 'E1-1-01-01-02-01'];
  console.log(`\n2️⃣ 3개 스테이지 클리어 학생 (${cleared.join(', ')}) 추천 5개:`);
  const nextStages = await recommendStagesTest(cleared, 5);
  nextStages.forEach((s, idx) => {
    const strictDeps = s.prerequisites.filter((p) => p.dependencyType === 'STRICT');
    const strictStatus = strictDeps.map((p) => `${p.title}(${p.isSatisfied ? '✅충족' : '❌미충족'})`).join(', ');
    console.log(`   ${idx + 1}. [Seq ${s.node.sequence}] [${s.node.code}] ${s.node.title} | STRICT 선수조건: [${strictStatus || '선수조건 없음'}]`);
  });

  // 검증: sequence 오름차순 및 STRICT 조건 충족 여부 확인
  let isSorted = true;
  let allStrictSatisfied = true;
  for (let i = 0; i < nextStages.length; i++) {
    if (i > 0 && nextStages[i].node.sequence <= nextStages[i - 1].node.sequence) isSorted = false;
    const strictUnmet = nextStages[i].prerequisites.some((p) => p.dependencyType === 'STRICT' && !p.isSatisfied);
    if (strictUnmet) allStrictSatisfied = false;
  }

  console.log('\n📊 검증 결과:');
  console.log(`   - Sequence 오름차순 정렬 여부: ${isSorted ? '✅ 완전 일치' : '❌ 정렬 불일치'}`);
  console.log(`   - STRICT 선수 조건 100% 충족 여부: ${allStrictSatisfied ? '✅ 완벽 충족' : '❌ 미충족'}`);
  console.log(`   - 기완료 스테이지 중복 추천 배제 여부: ${nextStages.every((s) => !cleared.includes(s.node.code)) ? '✅ 완벽 배제' : '❌ 중복'}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
