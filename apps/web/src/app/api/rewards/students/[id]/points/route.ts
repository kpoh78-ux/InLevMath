import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/db'

type Ctx = { params: Promise<{ id: string }> }

// 포인트 수동 추가/차감
export async function POST(req: NextRequest, { params }: Ctx) {
  const auth = await getAuthUser(req)
  if (!auth || auth.role !== 'teacher') return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { id: studentId } = await params
  const { amount, reason, type } = await req.json()

  if (typeof amount !== 'number' || amount === 0) {
    return NextResponse.json({ error: '유효한 포인트 값을 입력하세요.' }, { status: 400 })
  }
  if (!reason?.trim()) return NextResponse.json({ error: '사유를 입력하세요.' }, { status: 400 })

  const [student] = await prisma.$transaction([
    prisma.student.update({
      where: { id: studentId },
      data: { rewardPoints: { increment: amount } },
      select: { rewardPoints: true },
    }),
    prisma.pointTransaction.create({
      data: {
        studentId,
        amount,
        reason: reason.trim(),
        type: type ?? 'manual',
      },
    }),
  ])

  return NextResponse.json({ ok: true, rewardPoints: student.rewardPoints })
}
