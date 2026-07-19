import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/db'

type Ctx = { params: Promise<{ id: string }> }

// 선생님이 학생에게 아이템 지급
export async function POST(req: NextRequest, { params }: Ctx) {
  const auth = await getAuthUser(req)
  if (!auth || auth.role !== 'teacher') return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { id: studentId } = await params
  const { itemId, reason } = await req.json()
  if (!itemId) return NextResponse.json({ error: 'itemId 필요' }, { status: 400 })

  const item = await prisma.rewardItem.findUnique({ where: { id: itemId } })
  if (!item) return NextResponse.json({ error: '아이템 없음' }, { status: 404 })

  // 이미 보유 중이면 수량 증가
  const existing = await prisma.studentReward.findFirst({
    where: { studentId, itemId, status: 'owned' },
  })

  let reward
  if (existing) {
    reward = await prisma.studentReward.update({
      where: { id: existing.id },
      data: { quantity: { increment: 1 }, reason: reason ?? existing.reason },
      include: { item: true },
    })
  } else {
    reward = await prisma.studentReward.create({
      data: { studentId, itemId, quantity: 1, reason: reason ?? '' },
      include: { item: true },
    })
  }

  // 아이템에 포인트 값이 있으면 자동 지급
  if (item.pointValue > 0) {
    await prisma.$transaction([
      prisma.student.update({
        where: { id: studentId },
        data: { rewardPoints: { increment: item.pointValue } },
      }),
      prisma.pointTransaction.create({
        data: {
          studentId,
          amount: item.pointValue,
          reason: `아이템 획득: ${item.name}`,
          type: 'manual',
        },
      }),
    ])
  }

  return NextResponse.json({ ok: true, reward })
}
