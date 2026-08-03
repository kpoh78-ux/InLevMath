import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyToken } from '@/lib/auth'
import { purgeAnswerImages } from '@/lib/answerImageStore'

async function getTeacherFromReq(req: NextRequest) {
  const auth = req.headers.get('authorization')?.split(' ')[1]
  if (!auth) return null
  const payload = await verifyToken(auth)
  if (!payload || payload.role !== 'teacher') return null
  const teacher = await prisma.teacher.findFirst({ where: { userId: payload.sub } })
  return teacher
}

// DELETE /api/worksheets/[id]
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const teacher = await getTeacherFromReq(req)
  if (!teacher) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const { id } = await params
  const ws = await prisma.worksheet.findFirst({ where: { id, teacherId: teacher.id } })
  if (!ws) return NextResponse.json({ error: '학습지 없음' }, { status: 404 })

  // DB 행은 cascade로 지워지지만 오브젝트 스토리지 파일은 직접 정리해야 한다
  await purgeAnswerImages({ worksheetId: id })
  await prisma.worksheet.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}

// GET /api/worksheets/[id]/answers  — 정답 목록 조회
// PUT /api/worksheets/[id]/answers  — 정답 저장
// (별도 파일로 분리하지 않고 [id]/route.ts에서 공통 helper 노출)

// GET /api/worksheets/[id] — 단일 조회
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const teacher = await getTeacherFromReq(req)
  if (!teacher) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const { id } = await params
  const ws = await prisma.worksheet.findFirst({ where: { id, teacherId: teacher.id } })
  if (!ws) return NextResponse.json({ error: '학습지 없음' }, { status: 404 })
  return NextResponse.json(ws)
}
