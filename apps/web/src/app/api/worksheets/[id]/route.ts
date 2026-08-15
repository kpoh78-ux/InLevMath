import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyToken } from '@/lib/auth'
import { purgeAnswerImages } from '@/lib/answerImageStore'
import { academyTeacher } from '@/lib/academy'

async function getTeacherFromReq(req: NextRequest) {
  const auth = req.headers.get('authorization')?.split(' ')[1]
  if (!auth) return null
  const payload = await verifyToken(auth)
  if (!payload || payload.role !== 'teacher') return null
  const teacher = await academyTeacher(payload.sub)
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

// PATCH /api/worksheets/[id] — 학습지 정보 수정
// body: { title?, category?, step?, examSubType?, grade?, unit?, problemCount?, source? }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const teacher = await getTeacherFromReq(req)
  if (!teacher) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const { id } = await params
  const ws = await prisma.worksheet.findFirst({ where: { id, teacherId: teacher.id } })
  if (!ws) return NextResponse.json({ error: '학습지 없음' }, { status: 404 })

  const body = await req.json() as Record<string, unknown>
  const data: Record<string, unknown> = {}

  const str = (v: unknown) => typeof v === 'string' ? v.trim() : undefined

  if (str(body.title)) data.title = str(body.title)
  if (str(body.category)) data.category = str(body.category)
  if (str(body.step)) data.step = str(body.step)
  if (str(body.grade)) data.grade = str(body.grade)
  if (body.unit !== undefined) data.unit = str(body.unit) || '종합'
  if (str(body.source)) data.source = str(body.source)
  // examSubType은 세부 유형이 있는 단계(모의고사·기출문제)에서만 값이 온다. 그 외에는 null
  if (body.examSubType !== undefined) data.examSubType = str(body.examSubType) || null

  // 문제 수를 바꾸면 저장된 정답 배열 길이도 맞춰야 한다
  if (body.problemCount !== undefined) {
    const next = parseInt(String(body.problemCount))
    if (!Number.isInteger(next) || next < 1) {
      return NextResponse.json({ error: '문제 수를 확인해주세요.' }, { status: 400 })
    }
    data.problemCount = next

    if (next !== ws.problemCount && ws.answersJson) {
      let answers: string[] = []
      try { answers = JSON.parse(ws.answersJson) } catch { /* 손상된 값은 새로 만든다 */ }
      // 늘리면 빈 칸을 덧붙이고, 줄이면 뒤를 잘라낸다
      const resized = Array.from({ length: next }, (_, i) => answers[i] ?? '')
      data.answersJson = JSON.stringify(resized)

      // 줄어든 구간의 이미지 정답 정리
      if (next < ws.problemCount) {
        await prisma.answerImage.deleteMany({
          where: { worksheetId: id, problemNo: { gt: next } },
        })
      }
    }
  }

  const updated = await prisma.worksheet.update({ where: { id }, data })
  return NextResponse.json(updated)
}
