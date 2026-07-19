import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyToken } from '@/lib/auth'

// GET /api/student/inventory — 내 보관창고 (학생 본인)
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')?.split(' ')[1]
  if (!auth) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  const payload = await verifyToken(auth)
  if (!payload || payload.role !== 'student') return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const student = await prisma.student.findFirst({
    where: { userId: payload.sub },
    select: { id: true, rewardPoints: true, user: { select: { name: true } } },
  })
  if (!student) return NextResponse.json({ error: '학생 정보 없음' }, { status: 404 })

  const [rewards, pointHistory] = await Promise.all([
    prisma.studentReward.findMany({
      where: { studentId: student.id },
      include: { item: true },
      orderBy: { grantedAt: 'desc' },
    }),
    prisma.pointTransaction.findMany({
      where: { studentId: student.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
  ])

  return NextResponse.json({
    name: student.user.name,
    rewardPoints: student.rewardPoints,
    rewards,
    pointHistory,
  })
}
