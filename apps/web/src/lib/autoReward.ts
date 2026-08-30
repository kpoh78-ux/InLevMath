// 채점 결과에 따른 자동 보상
//
// 선생님이 보상관리에서 "정답률 N% 이상이면 X 지급" 규칙을 만들어 두면
// 학습지 채점이 들어올 때 여기서 자동으로 포인트/아이템을 준다.
//
// 두 가지를 지킨다.
//   1) 여러 규칙이 걸려도 기준 정답률이 가장 높은 것 하나만 준다 (등급제).
//      90%/80% 규칙이 둘 다 있을 때 95점 맞으면 90% 보상만 받는다.
//   2) 같은 채점 건은 한 번만 준다. 선생님이 다시 채점해도 중복 지급되지 않는다.
//      AutoRewardLog 의 (sourceType, sourceId, studentId) 유니크로 막는다.

import { prisma } from '@/lib/db'

export type RewardSource = 'worksheet'

export type AutoRewardResult = {
  ruleId: string
  label: string
  points: number
  itemName: string | null
}

/**
 * 채점 직후 호출한다. 지급했으면 요약을, 해당 없으면 null을 돌려준다.
 *
 * 보상 처리가 실패해도 채점 자체는 이미 끝난 상태다.
 * 호출부에서 try/catch로 감싸 채점 응답이 막히지 않게 한다.
 *
 * @param correctRate 0~100 정수
 */
export async function applyAutoReward(opts: {
  teacherId: string
  studentId: string
  sourceType: RewardSource
  sourceId: string
  correctRate: number
}): Promise<AutoRewardResult | null> {
  const { teacherId, studentId, sourceType, sourceId, correctRate } = opts

  // 1) 조건을 만족하는 규칙 중 기준이 가장 높은 하나
  const rule = await prisma.rewardRule.findFirst({
    where: {
      teacherId,
      enabled: true,
      source: { in: [sourceType, 'any'] },
      minRate: { lte: Math.round(correctRate) },
    },
    orderBy: { minRate: 'desc' },
    include: { item: true },
  })
  if (!rule) return null
  if (rule.points <= 0 && !rule.itemId) return null

  // 2) 중복 지급 방지 — 먼저 기록을 남겨 자리를 잡는다.
  //    이미 있으면 유니크 제약에 걸려 여기서 조용히 끝난다.
  try {
    await prisma.autoRewardLog.create({
      data: {
        studentId, sourceType, sourceId,
        ruleId: rule.id, points: rule.points, itemId: rule.itemId,
      },
    })
  } catch {
    return null   // 이미 이 채점 건으로 보상을 받았다
  }

  const label = rule.label.trim() || `정답률 ${rule.minRate}% 이상`
  const reason = `학습지 자동 보상: ${label}`

  // 3) 아이템 지급 (있으면). 수동 지급과 같은 규칙으로 수량을 올린다
  if (rule.item) {
    const existing = await prisma.studentReward.findFirst({
      where: { studentId, itemId: rule.item.id, status: 'owned' },
    })
    if (existing) {
      await prisma.studentReward.update({
        where: { id: existing.id },
        data: { quantity: { increment: 1 }, reason },
      })
    } else {
      await prisma.studentReward.create({
        data: { studentId, itemId: rule.item.id, quantity: 1, reason },
      })
    }
  }

  // 4) 포인트 — 규칙 포인트 + 아이템 자체 포인트 (수동 지급과 동일)
  const total = rule.points + (rule.item?.pointValue ?? 0)
  if (total > 0) {
    await prisma.$transaction([
      prisma.student.update({
        where: { id: studentId },
        data: { rewardPoints: { increment: total } },
      }),
      prisma.pointTransaction.create({
        data: { studentId, amount: total, reason, type: 'auto' },
      }),
    ])
  }

  return {
    ruleId: rule.id,
    label,
    points: total,
    itemName: rule.item?.name ?? null,
  }
}

/** 채점 응답을 막지 않도록 감싼 버전. 실패는 로그만 남긴다 */
export async function tryApplyAutoReward(
  opts: Parameters<typeof applyAutoReward>[0]
): Promise<AutoRewardResult | null> {
  try {
    return await applyAutoReward(opts)
  } catch (e) {
    console.error('[autoReward]', e)
    return null
  }
}
