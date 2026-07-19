import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/db'

// 선생님의 보상 아이템 목록 조회
export async function GET(req: NextRequest) {
  const auth = await getAuthUser(req)
  if (!auth || auth.role !== 'teacher') return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const teacher = await prisma.teacher.findUnique({ where: { userId: auth.sub } })
  if (!teacher) return NextResponse.json({ error: '선생님 정보 없음' }, { status: 404 })

  const items = await prisma.rewardItem.findMany({
    where: { teacherId: teacher.id },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(items)
}

// 보상 아이템 생성
export async function POST(req: NextRequest) {
  const auth = await getAuthUser(req)
  if (!auth || auth.role !== 'teacher') return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const teacher = await prisma.teacher.findUnique({ where: { userId: auth.sub } })
  if (!teacher) return NextResponse.json({ error: '선생님 정보 없음' }, { status: 404 })

  const { name, description, emoji, type, rarity, pointValue } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: '아이템 이름을 입력하세요.' }, { status: 400 })

  const item = await prisma.rewardItem.create({
    data: {
      teacherId: teacher.id,
      name: name.trim(),
      description: description ?? '',
      emoji: emoji ?? '🎁',
      type: type ?? 'virtual',
      rarity: rarity ?? 'common',
      pointValue: pointValue ?? 0,
    },
  })
  return NextResponse.json(item)
}

// 아이템 삭제
export async function DELETE(req: NextRequest) {
  const auth = await getAuthUser(req)
  if (!auth || auth.role !== 'teacher') return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { itemId } = await req.json()
  await prisma.rewardItem.deleteMany({ where: { id: itemId } })
  return NextResponse.json({ ok: true })
}
