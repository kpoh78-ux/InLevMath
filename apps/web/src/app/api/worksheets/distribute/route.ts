import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyToken } from '@/lib/auth'

// POST /api/worksheets/distribute — 학습지 배포
export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')?.split(' ')[1]
  if (!auth) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  const payload = await verifyToken(auth)
  if (!payload || payload.role !== 'teacher') return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const { worksheetId, studentIds } = await req.json()
  if (!worksheetId || !Array.isArray(studentIds) || studentIds.length === 0) {
    return NextResponse.json({ error: '학습지와 학생을 선택하세요.' }, { status: 400 })
  }

  // 이미 배포된 학생은 upsert(기존 유지)
  const results = await Promise.all(
    studentIds.map((studentId: string) =>
      prisma.worksheetDistribution.upsert({
        where: { worksheetId_studentId: { worksheetId, studentId } },
        update: {}, // 이미 있으면 건드리지 않음
        create: { worksheetId, studentId, status: 'distributed' },
      })
    )
  )

  return NextResponse.json({ distributed: results.length })
}

// GET /api/worksheets/distribute?worksheetId=xxx — 배포 현황
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')?.split(' ')[1]
  if (!auth) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  const payload = await verifyToken(auth)
  if (!payload || payload.role !== 'teacher') return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const worksheetId = req.nextUrl.searchParams.get('worksheetId')
  if (!worksheetId) return NextResponse.json([])

  const dists = await prisma.worksheetDistribution.findMany({
    where: { worksheetId },
    include: { student: { include: { user: { select: { name: true } } } }, result: true },
  })
  return NextResponse.json(dists)
}
