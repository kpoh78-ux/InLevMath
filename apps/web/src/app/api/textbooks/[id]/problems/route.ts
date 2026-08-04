import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { listAnswerImages, syncAnswerImages, type ImageOp } from '@/lib/answerImageStore'
import {
  IMAGE_ANSWER_MARKER,
  isImageAnswer,
  isImageDataUrl,
  parseImageDataUrl,
  MAX_ANSWER_IMAGE_BYTES,
  MAX_ANSWER_IMAGE_TOTAL_BYTES,
  PROBLEM_PAGE_SIZE,
  PROBLEM_PAGE_SIZE_MAX,
  MAX_TEXTBOOK_PROBLEMS,
  MAX_BOOK_PAGE,
} from '@/lib/answers'

async function getOwnedTextbook(req: NextRequest, id: string) {
  const auth = await getAuthUser(req)
  if (!auth || auth.role !== 'teacher') return { error: '인증이 필요합니다.', status: 401 as const }
  const teacher = await prisma.teacher.findUnique({ where: { userId: auth.sub } })
  if (!teacher) return { error: '선생님 정보를 찾을 수 없습니다.', status: 404 as const }
  const textbook = await prisma.textbook.findFirst({ where: { id, teacherId: teacher.id } })
  if (!textbook) return { error: '교재를 찾을 수 없습니다.', status: 404 as const }
  return { textbook }
}

/** 쿼리스트링의 단원/유형 필터. 값이 없으면 해당 조건 미적용 */
function unitFilter(sp: URLSearchParams) {
  const where: Record<string, string | number> = {}
  for (const key of ['majorUnit', 'middleUnit', 'minorUnit', 'section', 'subSection'] as const) {
    const v = sp.get(key)
    if (v !== null) where[key] = v
  }
  const bookPage = sp.get('bookPage')
  if (bookPage !== null && Number.isFinite(parseInt(bookPage))) {
    where.bookPage = parseInt(bookPage)
  }
  return where
}

// GET /api/textbooks/[id]/problems
//   ?majorUnit=&middleUnit=&minorUnit=&section=  단원/단계 필터 (정확히 일치)
//   ?from=&to=                                   번호 구간
//   ?page=1&pageSize=100                         페이지네이션
// → { problems, images, total, page, pageSize }
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const owned = await getOwnedTextbook(req, id)
  if ('error' in owned) return NextResponse.json({ error: owned.error }, { status: owned.status })

  const sp = req.nextUrl.searchParams
  const page = Math.max(1, parseInt(sp.get('page') ?? '1') || 1)
  const pageSize = Math.min(
    PROBLEM_PAGE_SIZE_MAX,
    Math.max(1, parseInt(sp.get('pageSize') ?? String(PROBLEM_PAGE_SIZE)) || PROBLEM_PAGE_SIZE)
  )

  const from = parseInt(sp.get('from') ?? '')
  const to = parseInt(sp.get('to') ?? '')
  const numberRange =
    Number.isFinite(from) || Number.isFinite(to)
      ? {
          number: {
            ...(Number.isFinite(from) ? { gte: from } : {}),
            ...(Number.isFinite(to) ? { lte: to } : {}),
          },
        }
      : {}

  const where = { textbookId: id, ...unitFilter(sp), ...numberRange }

  const [total, problems] = await Promise.all([
    prisma.textbookProblem.count({ where }),
    prisma.textbookProblem.findMany({
      where,
      orderBy: { number: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ])

  // 이 페이지에 이미지 정답이 있을 때만 이미지 URL을 조회한다
  const imageNos = problems.filter(p => isImageAnswer(p.answer)).map(p => p.number)
  const images: Record<number, string> = {}
  if (imageNos.length > 0) {
    const all = await listAnswerImages({ textbookId: id })
    for (const n of imageNos) if (all[n]) images[n] = all[n]
  }

  return NextResponse.json({ problems, images, total, page, pageSize })
}

type ProblemUpsert = {
  number: number
  bookPage?: number
  majorUnit?: string; middleUnit?: string; minorUnit?: string
  section?: string; subSection?: string
  type?: string
  answer?: string   // 텍스트 / IMAGE_ANSWER_MARKER / data URL
}

const clampBookPage = (v: unknown) => {
  const n = Math.floor(Number(v))
  return Number.isInteger(n) && n > 0 && n <= MAX_BOOK_PAGE ? n : 0
}

// PUT /api/textbooks/[id]/problems — 변경분만 저장
// body: { upserts?: ProblemUpsert[], deletes?: number[] }
//
// 전체 삭제 후 재생성하면 3000문제에서 요청·트랜잭션이 감당이 안 되므로
// 화면에서 실제로 바뀐 문제만 올려서 upsert 한다.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const owned = await getOwnedTextbook(req, id)
  if ('error' in owned) return NextResponse.json({ error: owned.error }, { status: owned.status })

  const { upserts = [], deletes = [] } = await req.json() as {
    upserts?: ProblemUpsert[]; deletes?: number[]
  }

  if (upserts.length > PROBLEM_PAGE_SIZE_MAX) {
    return NextResponse.json(
      { error: `한 번에 저장할 수 있는 문제는 ${PROBLEM_PAGE_SIZE_MAX}개까지입니다. 페이지를 나눠 저장해주세요.` },
      { status: 400 }
    )
  }

  // ── 이미지 정답 처리 ──
  // syncAnswerImages는 "교재 전체" 기준으로 동기화하므로, 이번 요청에 없는
  // 문제의 이미지가 지워지지 않도록 기존 이미지 목록을 먼저 읽어 합친다.
  const existingImages = await prisma.answerImage.findMany({
    where: { textbookId: id },
    select: { problemNo: true },
  })
  const opsByNo = new Map<number, ImageOp>(
    existingImages.map(e => [e.problemNo, { problemNo: e.problemNo, action: 'keep' as const }])
  )

  let totalBytes = 0
  const rows: Required<ProblemUpsert>[] = []

  for (const u of upserts) {
    const number = Number(u.number)
    if (!Number.isInteger(number) || number < 1) continue

    let answer = typeof u.answer === 'string' ? u.answer : ''
    let type = u.type === 'short' || u.type === 'image' ? u.type : 'multiple'

    if (isImageDataUrl(answer)) {
      const parsed = parseImageDataUrl(answer)
      if (!parsed) {
        return NextResponse.json({ error: `${number}번 이미지 형식이 올바르지 않습니다.` }, { status: 400 })
      }
      if (parsed.data.length > MAX_ANSWER_IMAGE_BYTES) {
        return NextResponse.json(
          { error: `${number}번 이미지가 너무 큽니다. (최대 ${Math.round(MAX_ANSWER_IMAGE_BYTES / 1024)}KB)` },
          { status: 400 }
        )
      }
      totalBytes += parsed.data.length
      opsByNo.set(number, { problemNo: number, action: 'put', dataUrl: answer })
      answer = IMAGE_ANSWER_MARKER
      type = 'image'
    } else if (isImageAnswer(answer)) {
      if (!opsByNo.has(number)) answer = ''   // 이미지가 실제로 없으면 미입력
      else type = 'image'
    } else {
      // 텍스트로 바뀌었으면 이미지 삭제
      opsByNo.delete(number)
      answer = answer.trim()
      if (type === 'image') type = 'short'
    }

    rows.push({
      number,
      bookPage: clampBookPage(u.bookPage),
      majorUnit: (u.majorUnit ?? '').trim(),
      middleUnit: (u.middleUnit ?? '').trim(),
      minorUnit: (u.minorUnit ?? '').trim(),
      section: (u.section ?? '').trim(),
      subSection: (u.subSection ?? '').trim(),
      type,
      answer,
    })
  }

  if (totalBytes > MAX_ANSWER_IMAGE_TOTAL_BYTES) {
    return NextResponse.json(
      { error: `한 번에 저장할 이미지 용량이 너무 큽니다. (최대 ${Math.round(MAX_ANSWER_IMAGE_TOTAL_BYTES / 1024 / 1024)}MB) 나눠서 저장해주세요.` },
      { status: 400 }
    )
  }

  const deleteNos = deletes.filter(n => Number.isInteger(n) && n >= 1)
  for (const n of deleteNos) opsByNo.delete(n)

  const savedNos = await syncAnswerImages({ textbookId: id }, [...opsByNo.values()])

  // 이미지가 결국 저장되지 않은 자리는 미입력으로 되돌린다
  for (const r of rows) {
    if (isImageAnswer(r.answer) && !savedNos.has(r.number)) { r.answer = ''; r.type = 'short' }
  }

  await prisma.$transaction([
    ...(deleteNos.length
      ? [prisma.textbookProblem.deleteMany({ where: { textbookId: id, number: { in: deleteNos } } })]
      : []),
    ...rows.map(r =>
      prisma.textbookProblem.upsert({
        where: { textbookId_number: { textbookId: id, number: r.number } },
        create: { textbookId: id, ...r },
        update: r,
      })
    ),
  ])

  return NextResponse.json({ ok: true, saved: rows.length, deleted: deleteNos.length })
}

// POST /api/textbooks/[id]/problems — 교재 페이지 + 단원/유형을 지정해 구역 하나를 추가
// body: { count, bookPage?, majorUnit?, middleUnit?, minorUnit?, section?, type?, startNumber? }
//
// startNumber를 안 주면 "해당 페이지의 마지막 번호 다음"에 이어 붙인다.
// 그 자리가 이미 차 있으면 교재 전체의 마지막 번호 뒤로 보낸다.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const owned = await getOwnedTextbook(req, id)
  if ('error' in owned) return NextResponse.json({ error: owned.error }, { status: owned.status })

  const body = await req.json() as {
    count: number; bookPage?: number
    majorUnit?: string; middleUnit?: string; minorUnit?: string
    section?: string; subSection?: string
    type?: string; startNumber?: number
  }

  const count = Math.floor(Number(body.count))
  if (!Number.isInteger(count) || count < 1) {
    return NextResponse.json({ error: '추가할 문제 수를 확인해주세요.' }, { status: 400 })
  }

  const current = await prisma.textbookProblem.count({ where: { textbookId: id } })
  if (current + count > MAX_TEXTBOOK_PROBLEMS) {
    return NextResponse.json(
      { error: `교재 1권당 문제는 ${MAX_TEXTBOOK_PROBLEMS}개까지입니다. (현재 ${current}개)` },
      { status: 400 }
    )
  }

  const bookPage = clampBookPage(body.bookPage)

  const lastOverall = await prisma.textbookProblem.findFirst({
    where: { textbookId: id },
    orderBy: { number: 'desc' },
    select: { number: true },
  })

  let start: number
  if (Number.isInteger(body.startNumber) && body.startNumber! > 0) {
    start = body.startNumber!
  } else if (bookPage > 0) {
    // 같은 페이지의 마지막 번호 뒤에 이어 붙인다
    const lastOnPage = await prisma.textbookProblem.findFirst({
      where: { textbookId: id, bookPage },
      orderBy: { number: 'desc' },
      select: { number: true },
    })
    start = lastOnPage ? lastOnPage.number + 1 : (lastOverall?.number ?? 0) + 1
  } else {
    start = (lastOverall?.number ?? 0) + 1
  }

  // 그 구간이 이미 차 있으면 교재 맨 뒤로 밀어서 넣는다 (덮어쓰기 사고 방지)
  const clash = await prisma.textbookProblem.count({
    where: { textbookId: id, number: { gte: start, lte: start + count - 1 } },
  })
  if (clash > 0) {
    if (Number.isInteger(body.startNumber) && body.startNumber! > 0) {
      return NextResponse.json(
        { error: `${start}~${start + count - 1}번 구간에 이미 ${clash}개 문제가 있습니다. 시작 번호를 바꿔주세요.` },
        { status: 400 }
      )
    }
    start = (lastOverall?.number ?? 0) + 1
  }

  await prisma.textbookProblem.createMany({
    data: Array.from({ length: count }, (_, i) => ({
      textbookId: id,
      number: start + i,
      bookPage,
      majorUnit: (body.majorUnit ?? '').trim(),
      middleUnit: (body.middleUnit ?? '').trim(),
      minorUnit: (body.minorUnit ?? '').trim(),
      section: (body.section ?? '').trim(),
      subSection: (body.subSection ?? '').trim(),
      type: body.type === 'short' || body.type === 'image' ? body.type : 'multiple',
      answer: '',
    })),
  })

  return NextResponse.json(
    { ok: true, added: count, from: start, to: start + count - 1, bookPage },
    { status: 201 }
  )
}