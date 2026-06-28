import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyToken } from '@/lib/auth'

async function getTeacher(req: NextRequest) {
  const auth = req.headers.get('authorization')?.split(' ')[1]
  if (!auth) return null
  const payload = await verifyToken(auth)
  if (!payload || payload.role !== 'teacher') return null
  return prisma.teacher.findFirst({ where: { userId: payload.sub } })
}

// GET /api/worksheets/[id]/answers
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const teacher = await getTeacher(req)
  if (!teacher) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const { id } = await params
  const ws = await prisma.worksheet.findFirst({ where: { id, teacherId: teacher.id } })
  if (!ws) return NextResponse.json({ error: '학습지 없음' }, { status: 404 })

  const answers: string[] = ws.answersJson ? JSON.parse(ws.answersJson) : []
  return NextResponse.json({ answers })
}

// PUT /api/worksheets/[id]/answers  — body: { answers: string[] }
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const teacher = await getTeacher(req)
  if (!teacher) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const { id } = await params
  const ws = await prisma.worksheet.findFirst({ where: { id, teacherId: teacher.id } })
  if (!ws) return NextResponse.json({ error: '학습지 없음' }, { status: 404 })

  const body = await req.json()
  const answers: string[] = body.answers ?? []

  if (answers.length !== ws.problemCount) {
    return NextResponse.json(
      { error: `문제 수(${ws.problemCount})와 정답 개수(${answers.length})가 다릅니다.` },
      { status: 400 }
    )
  }

  const updated = await prisma.worksheet.update({
    where: { id },
    data: { answersJson: JSON.stringify(answers) },
  })

  return NextResponse.json({ answers: JSON.parse(updated.answersJson!) })
}
