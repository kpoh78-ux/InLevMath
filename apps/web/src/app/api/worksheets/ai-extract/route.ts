// POST /api/worksheets/ai-extract
//
// 선생님 PC에서 읽은 학습지 파일(base64)을 받아 Claude로 정답을 뽑아 돌려준다.
// 파일은 저장하지 않고 응답 후 버린다.

import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { academyTeacher } from '@/lib/academy'
import {
  extractAnswersFromFile, MAX_UPLOAD_BYTES, SUPPORTED_MEDIA_TYPES,
} from '@/lib/aiAnswerExtract'

// 학습지 한 부를 통째로 읽으므로 시간이 걸린다
export const maxDuration = 300

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')?.split(' ')[1]
  if (!auth) return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  const payload = await verifyToken(auth)
  if (!payload || payload.role !== 'teacher') {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  }
  const teacher = await academyTeacher(payload.sub)
  if (!teacher) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  let body: {
    data?: string; mediaType?: string; fileName?: string; expectedCount?: number
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

  // base64는 원본의 약 4/3 크기
  if (data.length * 0.75 > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `파일이 너무 큽니다. (최대 ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB)` },
      { status: 413 }
    )
  }

  const expectedCount =
    Number.isInteger(body.expectedCount) && (body.expectedCount as number) > 0
      ? Math.min(body.expectedCount as number, 300)
      : undefined

  try {
    const result = await extractAnswersFromFile({ data, mediaType, fileName, expectedCount })
    return NextResponse.json(result)
  } catch (e) {
    console.error('[ai-extract]', e)
    const msg = e instanceof Error ? e.message : 'AI 정답 추출에 실패했습니다.'
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}