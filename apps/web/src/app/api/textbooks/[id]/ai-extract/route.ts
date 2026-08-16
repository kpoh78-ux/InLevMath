// POST /api/textbooks/[id]/ai-extract
//
// 교재 정답·해설 PDF를 받아 문항별 정답과 단원·유형·쪽번호를 읽어 돌려준다.
// 저장은 하지 않는다. 선생님이 검수한 뒤 PUT /api/textbooks/[id]/problems 로 저장한다.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyToken } from '@/lib/auth'
import { academyTeacher } from '@/lib/academy'
import {
  extractTextbookAnswers, MAX_TEXTBOOK_UPLOAD_BYTES,
} from '@/lib/aiTextbookExtract'
import { SUPPORTED_MEDIA_TYPES } from '@/lib/aiAnswerExtract'

// 교재 한 권 분량을 읽으므로 시간이 걸린다
export const maxDuration = 600

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = req.headers.get('authorization')?.split(' ')[1]
  if (!token) return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  const payload = await verifyToken(token)
  if (!payload || payload.role !== 'teacher') {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  }
  const teacher = await academyTeacher(payload.sub)
  if (!teacher) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const { id } = await params
  const textbook = await prisma.textbook.findFirst({
    where: { id, teacherId: teacher.id },
    select: { id: true, title: true, publisher: true },
  })
  if (!textbook) return NextResponse.json({ error: '교재를 찾을 수 없습니다.' }, { status: 404 })

  let body: {
    data?: string; mediaType?: string; fileName?: string; fromNumber?: number
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '요청을 읽지 못했습니다.' }, { status: 400 })
  }

  const { data, mediaType, fileName } = body
  if (!data || !mediaType || !fileName) {
    return NextResponse.json({ error: '파일 정보가 없습니다.' }, { status: 400 })
  }
  if (!(SUPPORTED_MEDIA_TYPES as readonly string[]).includes(mediaType)) {
    return NextResponse.json(
      { error: 'PDF 또는 이미지(png/jpg/webp) 파일만 읽을 수 있습니다.' },
      { status: 400 }
    )
  }
  if (data.length * 0.75 > MAX_TEXTBOOK_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `파일이 너무 큽니다. (최대 ${Math.round(MAX_TEXTBOOK_UPLOAD_BYTES / 1024 / 1024)}MB) 정답 PDF를 나눠서 올려주세요.` },
      { status: 413 }
    )
  }

  const fromNumber =
    Number.isInteger(body.fromNumber) && (body.fromNumber as number) > 0
      ? (body.fromNumber as number)
      : undefined

  try {
    const result = await extractTextbookAnswers({
      data, mediaType, fileName,
      title: textbook.title,
      publisher: textbook.publisher,
      fromNumber,
    })
    return NextResponse.json(result)
  } catch (e) {
    console.error('[textbook ai-extract]', e)
    const msg = e instanceof Error ? e.message : 'AI 정답 추출에 실패했습니다.'
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
