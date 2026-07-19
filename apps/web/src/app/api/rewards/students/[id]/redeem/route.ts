import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/db'

type Ctx = { params: Promise<{ id: string }> }

// 실물 보상 수령 처리 (선생님이 지급 완료 처리)
export async function POST(req: NextRequest, { params }: Ctx) {
  const auth = await getAuthUser(req)
  if (!auth || auth.role !== 'teacher') return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { id: studentId } = await params
  const { rewardId } = await req.json()

  const reward = await prisma.studentReward.findFirst({
    where: { id: rewardId, studentId },
    include: { item: true },
  })
  if (!reward) return NextResponse.json({ error: '보상 없음' }, { status: 404 })

  const updated = await prisma.studentReward.update({
    where: { id: rewardId },
    data: { status: 'redeemed', redeemedAt: new Date() },
    include: { item: true },
  })

  return NextResponse.json({ ok: true, reward: updated })
}
