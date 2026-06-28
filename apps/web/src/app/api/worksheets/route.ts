import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyToken } from '@/lib/auth'

// GET /api/worksheets — 선생님 학습지 목록
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')?.split(' ')[1]
  if (!auth) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  const payload = await verifyToken(auth)
  if (!payload || payload.role !== 'teacher') return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const teacher = await prisma.teacher.findFirst({ where: { userId: payload.sub } })
  if (!teacher) return NextResponse.json({ error: '선생님 정보 없음' }, { status: 404 })

  const worksheets = await prisma.worksheet.findMany({
    where: { teacherId: teacher.id },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(worksheets)
}

// POST /api/worksheets — 학습지 등록
export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')?.split(' ')[1]
  if (!auth) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  const payload = await verifyToken(auth)
  if (!payload || payload.role !== 'teacher') return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const teacher = await prisma.teacher.findFirst({ where: { userId: payload.sub } })
  if (!teacher) return NextResponse.json({ error: '선생님 정보 없음' }, { status: 404 })

  const body = await req.json()
  const { title, category, step, examSubType, grade, unit, problemCount, source } = body

  if (!title || !category || !step || !grade || !problemCount) {
    return NextResponse.json({ error: '필수 항목 누락' }, { status: 400 })
  }

  // 단원별 동일 스텝 10개 제한
  const count = await prisma.worksheet.count({
    where: { teacherId: teacher.id, category, step, grade, unit: unit || '종합' },
  })
  if (count >= 10) {
    return NextResponse.json({ error: `${grade} ${unit} ${step} 학습지는 최대 10개까지 등록 가능합니다.` }, { status: 400 })
  }

  const ws = await prisma.worksheet.create({
    data: {
      title, category, step,
      examSubType: examSubType || null,
      grade, unit: unit || '종합',
      problemCount: parseInt(problemCount),
      source: source || 'manual',
      teacherId: teacher.id,
    },
  })
  return NextResponse.json(ws, { status: 201 })
}
