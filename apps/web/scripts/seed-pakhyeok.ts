/**
 * 테스트 시드 스크립트 — 박채혁 학생 학습 데이터 삽입
 * 실행: npx tsx scripts/seed-pakhyeok.ts
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000)
}

function wrongOf(total: number, rate: number): number[] {
  const correct = Math.round(total * rate / 100)
  const wrongCount = total - correct
  // 뒤쪽 번호부터 오답으로
  return Array.from({ length: wrongCount }, (_, i) => total - i)
}

async function main() {
  // ── 1. 선생님 찾기 ─────────────────────────────────────
  const teacher = await prisma.teacher.findFirst({ include: { user: true } })
  if (!teacher) throw new Error('선생님 계정이 없습니다. 먼저 선생님을 등록하세요.')
  console.log(`✅ 선생님: ${teacher.user.name}`)

  // ── 2. 박채혁 학생 찾기 ───────────────────────────────
  const student = await prisma.student.findFirst({
    where: {
      teacherId: teacher.id,
      user: { name: { contains: '박채혁' } },
    },
    include: { user: true },
  })
  if (!student) throw new Error('박채혁 학생을 찾을 수 없습니다. 먼저 학생을 등록하세요.')
  console.log(`✅ 학생: ${student.user.name} (${student.grade})`)

  // ── 3. 학습지 + 배포 + 채점 결과 생성 ────────────────────
  const worksheetData = [
    { title: '[오답] 길이 재기',                                   step: '기초', unit: '길이 재기',  problems: 10, rate: 100, daysAgo: 28 },
    { title: '[오답] 디딤돌 기본+응용 - 초등수학2-1 113~139p',    step: '기본', unit: '길이 재기',  problems: 20, rate: 85,  daysAgo: 24 },
    { title: '[오답] 디딤돌 기본+응용 - 초등수학2-1 147,149p',    step: '기본', unit: '길이 재기',  problems: 4,  rate: 75,  daysAgo: 20 },
    { title: '[오답] 디딤돌 기본+응용 - 초등수학2-1 96,98,100~102p', step: '기본', unit: '덧셈과 뺄셈', problems: 6,  rate: 83,  daysAgo: 17 },
    { title: '길이 재기',                                         step: '기초', unit: '길이 재기',  problems: 20, rate: 75,  daysAgo: 14 },
    { title: '길이 재기',                                         step: '기본', unit: '길이 재기',  problems: 20, rate: 85,  daysAgo: 11 },
    { title: '길이 재기',                                         step: '발전', unit: '길이 재기',  problems: 20, rate: 85,  daysAgo: 7  },
    { title: '덧셈과 뺄셈',                                       step: '기초', unit: '덧셈과 뺄셈', problems: 20, rate: 75,  daysAgo: 5  },
    { title: '디딤돌 기본+응용 - 초등수학2-1 101~109p',            step: '발전', unit: '덧셈과 뺄셈', problems: 10, rate: 60,  daysAgo: 2  },
  ]

  for (const ws of worksheetData) {
    const wrong = wrongOf(ws.problems, ws.rate)
    const correct = ws.problems - wrong.length

    const worksheet = await prisma.worksheet.create({
      data: {
        title: ws.title,
        category: '단원별',
        step: ws.step,
        grade: student.grade || '초2',
        unit: ws.unit,
        problemCount: ws.problems,
        source: 'manual',
        teacherId: teacher.id,
        createdAt: daysAgo(ws.daysAgo + 1),
      },
    })

    const distributedAt = daysAgo(ws.daysAgo)
    const dist = await prisma.worksheetDistribution.create({
      data: {
        worksheetId: worksheet.id,
        studentId: student.id,
        status: 'graded',
        distributedAt,
      },
    })

    await prisma.worksheetResult.create({
      data: {
        distributionId: dist.id,
        correctProblems: correct,
        wrongProblemsJson: JSON.stringify(wrong),
        gradedBy: 'teacher',
        submittedAt: new Date(distributedAt.getTime() + 60 * 60 * 1000),
      },
    })

    console.log(`  📄 ${ws.title} — ${ws.problems}문제 ${ws.rate}% (오답 ${wrong.length}개)`)
  }

  // ── 4. 교재 + 문제 + 채점 결과 생성 ─────────────────────
  const textbookProblemCount = 374
  const textbookRate = 82
  const tbWrong = wrongOf(textbookProblemCount, textbookRate)
  const tbCorrect = textbookProblemCount - tbWrong.length

  const textbook = await prisma.textbook.create({
    data: {
      title: '[1회차] 디딤돌 기본+응용 - 초등수학2-1',
      grade: student.grade || '초2',
      publisher: '좋은책신사고',
      teacherId: teacher.id,
      createdAt: daysAgo(30),
      problems: {
        create: Array.from({ length: textbookProblemCount }, (_, i) => ({
          number: i + 1,
          unit: i < 120 ? '덧셈과 뺄셈' : i < 250 ? '길이 재기' : '시각과 시간',
          type: 'multiple',
          answer: String((i % 5) + 1),
        })),
      },
    },
  })

  await prisma.textbookResult.create({
    data: {
      textbookId: textbook.id,
      studentId: student.id,
      wrongProblemsJson: JSON.stringify(tbWrong),
      gradedBy: 'teacher',
      submittedAt: daysAgo(15),
    },
  })

  console.log(`  📚 [1회차] 디딤돌 기본+응용 - 초등수학2-1 — ${textbookProblemCount}문제 ${textbookRate}% (오답 ${tbWrong.length}개)`)

  // ── 5. 학생 능력치 업데이트 ──────────────────────────────
  await prisma.student.update({
    where: { id: student.id },
    data: { comprehension: 52.4, reasoning: 38.7, calculation: 61.2 },
  })

  console.log('\n🎉 시드 데이터 삽입 완료!')
  console.log(`   학습지: ${worksheetData.length}개 채점`)
  console.log(`   교재  : 1개 채점 (${textbookProblemCount}문제)`)
}

main()
  .catch(e => { console.error('❌ 오류:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
