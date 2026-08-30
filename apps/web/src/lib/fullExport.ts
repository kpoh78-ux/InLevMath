// pg_dump 없이 만드는 전체 백업 (서버 전용)
//
// 운영 서버(Railway/Linux 컨테이너)에는 pg_dump이 없다. 설치하려면 빌드 이미지를
// 손봐야 하고, 그때까지 백업을 못 받는 상태로 둘 수는 없다.
// 그래서 Prisma로 모든 테이블을 읽어 JSON 한 덩이로 내보낸다.
//
// core 백업(/api/backup/core)과 다른 점:
//   · core 는 학생·학습지·배포 등 "핵심"만 담아 AnswerImage 가 빠져 있었다.
//     정답 스냅샷 이미지는 손으로 찍어 넣은 것이라 되살릴 수 없는데도 백업이 안 됐다.
//   · 여기서는 스키마의 모든 테이블을 담는다.
//
// 메모리: 테이블 하나씩 페이지 단위로 읽어 즉시 흘려보낸다.
// 정답 이미지(base64)가 가장 크므로 페이지를 작게 잡는다.

import { prisma } from '@/lib/db'

/** 내보낼 테이블 — Prisma 모델명. 순서는 복원할 때 참조 순서를 고려해 부모 → 자식 */
export const EXPORT_MODELS = [
  // 사람·학원 운영
  'user', 'teacher', 'student', 'attendanceLog', 'classSchedule',
  // 학습 자료
  'worksheet', 'answerImage',
  // 배포·채점
  'worksheetDistribution', 'worksheetResult', 'missionResult',
  // 보상
  'rewardItem', 'rewardRule', 'studentReward', 'pointTransaction', 'autoRewardLog',
  // 분석·리포트
  'studentSubUnitStat', 'studentPatternStat', 'studentWeaknessConfig',
  'prescriptiveMission', 'dailyLessonReport',
  // 알림톡
  'alimtalkSendLog', 'alimtalkLog',
  // 교육과정 사전 (시드로 다시 만들 수 있지만 함께 담아 둔다)
  'mathMajorUnit', 'mathMiddleUnit', 'mathSubUnit', 'mathPatternType', 'question',
  'conceptNode', 'conceptDependency',
] as const

/** base64 이미지가 들어 있는 테이블은 한 번에 적게 읽는다 */
const PAGE_SIZE: Record<string, number> = {
  answerImage: 25,
  worksheet: 200,
}
const DEFAULT_PAGE = 1000

/** Date·BigInt 를 JSON 으로 안전하게 */
function replacer(_key: string, value: unknown) {
  if (typeof value === 'bigint') return value.toString()
  return value
}

/**
 * 전체 백업 JSON 을 조각조각 만들어 넘긴다.
 * 호출부는 받은 문자열을 그대로 스트림에 흘리면 된다.
 */
export async function* streamFullExport(): AsyncGenerator<string> {
  const client = prisma as unknown as Record<string, {
    findMany: (a: unknown) => Promise<unknown[]>
    count: () => Promise<number>
  }>

  yield '{\n'
  yield `  "format": "inlevmath-full-export",\n`
  yield `  "version": 1,\n`
  yield `  "exportedAt": ${JSON.stringify(new Date().toISOString())},\n`
  yield `  "note": "pg_dump 없이 Prisma로 전체 테이블을 내보낸 백업입니다.",\n`
  yield '  "tables": {\n'

  const counts: Record<string, number> = {}

  for (let i = 0; i < EXPORT_MODELS.length; i++) {
    const name = EXPORT_MODELS[i]
    const model = client[name]
    yield `    ${JSON.stringify(name)}: [`

    let written = 0
    if (model) {
      const take = PAGE_SIZE[name] ?? DEFAULT_PAGE
      let skip = 0
      for (;;) {
        let page: unknown[]
        try {
          page = await model.findMany({ take, skip, orderBy: { id: 'asc' } })
        } catch {
          // id 로 정렬할 수 없는 테이블은 정렬 없이 읽는다
          page = await model.findMany({ take, skip })
        }
        if (page.length === 0) break
        for (const row of page) {
          yield (written === 0 ? '\n      ' : ',\n      ') + JSON.stringify(row, replacer)
          written++
        }
        if (page.length < take) break
        skip += take
      }
    }

    counts[name] = written
    yield written > 0 ? '\n    ]' : ']'
    yield i === EXPORT_MODELS.length - 1 ? '\n' : ',\n'
  }

  yield '  },\n'
  yield `  "counts": ${JSON.stringify(counts)}\n`
  yield '}\n'
}
