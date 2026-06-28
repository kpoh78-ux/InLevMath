import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyToken } from '@/lib/auth'

// DELETE /api/worksheets/[id]
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = req.headers.get('authorization')?.split(' ')[1]
  if (!auth) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  const payload = await verifyToken(auth)
  if (!payload || payload.role !== 'teacher') return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const { id } = await params
  const teacher = await prisma.teacher.findFirst({ where: { userId: payload.sub } })
  if (!teacher) return NextResponse.json({ error: '선생님 정보 없음' }, { status: 404 })

  const ws = await prisma.worksheet.findFirst({ where: { id, teacherId: teacher.id } })
  if (!ws) return NextResponse.json({ error: '학습지 없음' }, { status: 404 })

  await prisma.worksheet.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
