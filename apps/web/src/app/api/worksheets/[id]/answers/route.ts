import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyToken } from '@/lib/auth'
import { listAnswerImages, syncAnswerImages, type ImageOp } from '@/lib/answerImageStore'
import {
  IMAGE_ANSWER_MARKER,
  isImageAnswer,
  isImageDataUrl,
  parseImageDataUrl,
  MAX_ANSWER_IMAGE_BYTES,
  MAX_ANSWER_IMAGE_TOTAL_BYTES,
} from '@/lib/answers'

async function getTeacher(req: NextRequest) {
  const auth = req.headers.get('authorization')?.split(' ')[1]
  if (!auth) return null
  const payload = await verifyToken(auth)
  if (!payload || payload.role !== 'teacher') return null
  return prisma.teacher.findFirst({ where: { userId: payload.sub } })
}

// GET /api/worksheets/[id]/answers
// → { answers: string[], images: { [problemNo]: url } }
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
  const images = await listAnswerImages({ worksheetId: id })

  return NextResponse.json({ answers, images })
}

// PUT /api/worksheets/[id]/answers — body: { answers: string[] }
//
// answers 각 항목이 가질 수 있는 값:
//   "data:image/webp;base64,..."  새로 첨부/교체된 이미지 정답
//   "__img__"                     기존 이미지 정답 유지
//   그 외 문자열                    텍스트(수식) 정답. 기존 이미지가 있으면 삭제됨
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
  const incoming: string[] = body.answers ?? []

  if (incoming.length !== ws.problemCount) {
    return NextResponse.json(
      { error: `문제 수(${ws.problemCount})와 정답 개수(${incoming.length})가 다릅니다.` },
      { status: 400 }
    )
  }

  const answers: string[] = []
  const ops: ImageOp[] = []
  let totalBytes = 0

  for (let i = 0; i < incoming.length; i++) {
    const raw = typeof incoming[i] === 'string' ? incoming[i] : ''
    const problemNo = i + 1

    if (isImageDataUrl(raw)) {
      const parsed = parseImageDataUrl(raw)
      if (!parsed) {
        return NextResponse.json({ error: `${problemNo}번 이미지 형식이 올바르지 않습니다.` }, { status: 400 })
      }
      if (parsed.data.length > MAX_ANSWER_IMAGE_BYTES) {
        return NextResponse.json(
          { error: `${problemNo}번 이미지가 너무 큽니다. (최대 ${Math.round(MAX_ANSWER_IMAGE_BYTES / 1024)}KB)` },
          { status: 400 }
        )
      }
      totalBytes += parsed.data.length
      ops.push({ problemNo, action: 'put', dataUrl: raw })
      answers.push(IMAGE_ANSWER_MARKER)
    } else if (isImageAnswer(raw)) {
      ops.push({ problemNo, action: 'keep' })
      answers.push(IMAGE_ANSWER_MARKER)
    } else {
      answers.push(raw.trim())
    }
  }

  if (totalBytes > MAX_ANSWER_IMAGE_TOTAL_BYTES) {
    return NextResponse.json(
      { error: `한 번에 저장할 이미지 용량이 너무 큽니다. (최대 ${Math.round(MAX_ANSWER_IMAGE_TOTAL_BYTES / 1024 / 1024)}MB) 나눠서 저장해주세요.` },
      { status: 400 }
    )
  }

  const savedNos = await syncAnswerImages({ worksheetId: id }, ops)

  // 'keep'이었지만 실제 이미지가 없던 자리는 미입력으로 되돌린다
  for (let i = 0; i < answers.length; i++) {
    if (isImageAnswer(answers[i]) && !savedNos.has(i + 1)) answers[i] = ''
  }

  await prisma.worksheet.update({
    where: { id },
    data: { answersJson: JSON.stringify(answers) },
  })

  const images = await listAnswerImages({ worksheetId: id })
  return NextResponse.json({ answers, images })
}