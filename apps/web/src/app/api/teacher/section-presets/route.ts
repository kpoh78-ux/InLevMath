import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { TEXTBOOK_SECTION_PRESETS, MAX_SECTION_PRESETS, MAX_SECTION_NAME_LENGTH } from '@/lib/answers'
import { academyTeacher } from '@/lib/academy'

async function getTeacher(req: NextRequest) {
  const auth = await getAuthUser(req)
  if (!auth || auth.role !== 'teacher') return null
  return academyTeacher(auth.sub)
}

const parse = (json: string | null): string[] => {
  if (!json) return TEXTBOOK_SECTION_PRESETS
  try {
    const arr = JSON.parse(json)
    return Array.isArray(arr) ? arr.filter(v => typeof v === 'string') : TEXTBOOK_SECTION_PRESETS
  } catch {
    return TEXTBOOK_SECTION_PRESETS
  }
}

// GET /api/teacher/section-presets — 문제유형 목록 (학원 공용)
export async function GET(req: NextRequest) {
  const teacher = await getTeacher(req)
  if (!teacher) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const row = await prisma.teacher.findUnique({
    where: { id: teacher.id },
    select: { sectionPresetsJson: true },
  })
  return NextResponse.json({ presets: parse(row?.sectionPresetsJson ?? null) })
}

// PUT /api/teacher/section-presets — body: { presets: string[] }
export async function PUT(req: NextRequest) {
  const teacher = await getTeacher(req)
  if (!teacher) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const body = await req.json() as { presets?: unknown }
  if (!Array.isArray(body.presets)) {
    return NextResponse.json({ error: '목록 형식이 올바르지 않습니다.' }, { status: 400 })
  }

  // 공백 제거 → 빈 값 제외 → 중복 제거 (입력 순서 유지)
  const presets = [...new Set(
    body.presets
      .filter((v): v is string => typeof v === 'string')
      .map(v => v.trim())
      .filter(v => v !== '')
  )]

  if (presets.length > MAX_SECTION_PRESETS) {
    return NextResponse.json(
      { error: `문제유형은 ${MAX_SECTION_PRESETS}개까지 등록할 수 있습니다.` },
      { status: 400 }
    )
  }
  const tooLong = presets.find(p => p.length > MAX_SECTION_NAME_LENGTH)
  if (tooLong) {
    return NextResponse.json(
      { error: `"${tooLong}" — 문제유형 이름은 ${MAX_SECTION_NAME_LENGTH}자 이내로 입력해주세요.` },
      { status: 400 }
    )
  }

  await prisma.teacher.update({
    where: { id: teacher.id },
    data: { sectionPresetsJson: JSON.stringify(presets) },
  })

  return NextResponse.json({ presets })
}