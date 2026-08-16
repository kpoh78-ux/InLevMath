// 자동 보상 규칙 관리 (보상관리 → 자동 보상 설정)
//
// 규칙은 학원 단위로 공유된다. academyTeacher 를 거쳐 소유자 선생님 id 를 쓴다.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyToken } from '@/lib/auth'
import { academyTeacher } from '@/lib/academy'

const SOURCES = ['worksheet', 'textbook', 'any'] as const

/** 규칙은 한 학원에 이 개수까지. 등급 몇 단계면 충분하다 */
const MAX_RULES = 20

async function getTeacher(req: NextRequest) {
  const auth = req.headers.get('authorization')?.split(' ')[1]
  if (!auth) return null
  const payload = await verifyToken(auth)
  if (!payload || payload.role !== 'teacher') return null
  return academyTeacher(payload.sub)
}

/** 입력값 정리 — 범위를 벗어난 값은 잘라낸다 */
function normalize(body: Record<string, unknown>) {
  const source = SOURCES.includes(body.source as typeof SOURCES[number])
    ? body.source as string
    : 'any'
  const minRate = Math.min(100, Math.max(0, Math.round(Number(body.minRate) || 0)))
  const points = Math.min(10000, Math.max(0, Math.round(Number(body.points) || 0)))
  const label = typeof body.label === 'string' ? body.label.trim().slice(0, 40) : ''
  const itemId = typeof body.itemId === 'string' && body.itemId !== '' ? body.itemId : null
  const enabled = body.enabled !== false
  return { source, minRate, points, label, itemId, enabled }
}

// GET — 규칙 목록 (기준 정답률 높은 순)
export async function GET(req: NextRequest) {
  const teacher = await getTeacher(req)
  if (!teacher) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const rules = await prisma.rewardRule.findMany({
    where: { teacherId: teacher.id },
    orderBy: [{ minRate: 'desc' }, { createdAt: 'asc' }],
    include: { item: { select: { id: true, name: true, emoji: true, pointValue: true } } },
  })
  return NextResponse.json(rules)
}

// POST — 규칙 추가
export async function POST(req: NextRequest) {
  const teacher = await getTeacher(req)
  if (!teacher) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const data = normalize(body)

  if (data.points <= 0 && !data.itemId) {
    return NextResponse.json({ error: '지급할 포인트나 아이템 중 하나는 정해야 합니다.' }, { status: 400 })
  }

  const count = await prisma.rewardRule.count({ where: { teacherId: teacher.id } })
  if (count >= MAX_RULES) {
    return NextResponse.json({ error: `규칙은 최대 ${MAX_RULES}개까지 만들 수 있습니다.` }, { status: 400 })
  }

  // 남의 학원 아이템을 걸지 못하게 한다
  if (data.itemId) {
    const item = await prisma.rewardItem.findFirst({
      where: { id: data.itemId, teacherId: teacher.id }, select: { id: true },
    })
    if (!item) return NextResponse.json({ error: '아이템을 찾을 수 없습니다.' }, { status: 404 })
  }

  const rule = await prisma.rewardRule.create({
    data: { ...data, teacherId: teacher.id },
    include: { item: { select: { id: true, name: true, emoji: true, pointValue: true } } },
  })
  return NextResponse.json(rule, { status: 201 })
}

// PATCH — 규칙 수정 (켜기/끄기 포함). body: { id, ...변경할 값 }
export async function PATCH(req: NextRequest) {
  const teacher = await getTeacher(req)
  if (!teacher) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const id = typeof body.id === 'string' ? body.id : ''
  if (!id) return NextResponse.json({ error: '규칙을 찾을 수 없습니다.' }, { status: 400 })

  const existing = await prisma.rewardRule.findFirst({ where: { id, teacherId: teacher.id } })
  if (!existing) return NextResponse.json({ error: '규칙을 찾을 수 없습니다.' }, { status: 404 })

  // 켜기/끄기만 보내는 경우가 많아 보낸 항목만 바꾼다
  const data: Record<string, unknown> = {}
  if (body.enabled !== undefined) data.enabled = body.enabled !== false
  if (body.source !== undefined || body.minRate !== undefined ||
      body.points !== undefined || body.label !== undefined || body.itemId !== undefined) {
    const n = normalize({ ...existing, ...body })
    if (n.points <= 0 && !n.itemId) {
      return NextResponse.json({ error: '지급할 포인트나 아이템 중 하나는 정해야 합니다.' }, { status: 400 })
    }
    if (n.itemId) {
      const item = await prisma.rewardItem.findFirst({
        where: { id: n.itemId, teacherId: teacher.id }, select: { id: true },
      })
      if (!item) return NextResponse.json({ error: '아이템을 찾을 수 없습니다.' }, { status: 404 })
    }
    Object.assign(data, n)
  }

  const rule = await prisma.rewardRule.update({
    where: { id }, data,
    include: { item: { select: { id: true, name: true, emoji: true, pointValue: true } } },
  })
  return NextResponse.json(rule)
}

// DELETE — body: { id }
export async function DELETE(req: NextRequest) {
  const teacher = await getTeacher(req)
  if (!teacher) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const { id } = await req.json().catch(() => ({ id: '' }))
  if (!id) return NextResponse.json({ error: '규칙을 찾을 수 없습니다.' }, { status: 400 })

  const { count } = await prisma.rewardRule.deleteMany({ where: { id, teacherId: teacher.id } })
  if (count === 0) return NextResponse.json({ error: '규칙을 찾을 수 없습니다.' }, { status: 404 })

  return NextResponse.json({ ok: true })
}
