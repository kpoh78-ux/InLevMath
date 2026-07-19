import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/db'

type Ctx = { params: Promise<{ id: string }> }

// 학생 보관창고 조회 (선생님 or 학생 본인)
export async function GET(req: NextRequest, { params }: Ctx) {
  const auth = await getAuthUser(req)
  if (!auth) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { id } = await params

  // 학생 본인이면 자기 id, 선생님이면 해당 학생
  if (auth.role === 'student') {
    const student = await prisma.student.findUnique({ where: { userId: auth.sub } })
    if (!student || student.id !== id) return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  }

  const [student, rewards, pointHistory] = await Promise.all([
    prisma.student.findUnique({
      where: { id },
      select: { rewardPoints: true, user: { select: { name: true } } },
    }),
    prisma.studentReward.findMany({
      where: { studentId: id },
      include: { item: true },
      orderBy: { grantedAt: 'desc' },
    }),
    prisma.pointTransaction.findMany({
      where: { studentId: id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
  ])

  if (!student) return NextResponse.json({ error: '학생 없음' }, { status: 404 })

  return NextResponse.json({
    name: student.user.name,
    rewardPoints: student.rewardPoints,
    rewards,
    pointHistory,
  })
}
