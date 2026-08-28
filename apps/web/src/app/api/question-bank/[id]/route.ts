import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getTeacherAuth } from '@/lib/teacherAuth'
import { clampDifficulty, VARIANT_KINDS, type VariantKind } from '@inlevmath/shared'

// 문제은행 한 문항 — 조회 · 선생님 수정 · 오류 표시.
//
// 반입된 문제에 오류가 있으면 선생님이 여기서 고친다. 고친 흔적을 남기는 이유는
// **재반입이 되돌리지 못하게** 하기 위해서다 (lib/questionImport.ts 참고).
//   editedBy/editedAt  → 본문·답·풀이를 고쳤다. 반입이 내용을 건드리지 않는다
//   classifiedBy       → 좌표·난이도를 고쳤다. 반입이 분류를 건드리지 않는다
//
// 오류 문제를 지우지 않고 status 로 표시만 하는 이유: 이미 학생에게 나간
// 기록이 남아 있어, 지우면 그 기록의 문항이 사라진다.

export const dynamic = 'force-dynamic'

const STATUSES = ['active', 'flagged', 'retired']

const DETAIL = {
  subUnit: {
    select: {
      name: true,
      middleUnit: { select: { name: true, majorUnit: { select: { name: true } } } },
    },
  },
  patternType: { select: { typeName: true } },
  conceptNode: { select: { code: true, title: true } },
  origin: { select: { id: true, sourceRef: true, title: true, content: true } },
  variants: {
    select: { id: true, variantKind: true, content: true, answer: true, difficulty: true },
    orderBy: { createdAt: 'asc' },
  },
  concepts: {
    select: { role: true, conceptNode: { select: { id: true, title: true } } },
  },
} as const

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const me = await getTeacherAuth(req)
  if (!me) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const { id } = await params
  const q = await prisma.question.findUnique({ where: { id }, include: DETAIL })
  if (!q) return NextResponse.json({ error: '문항을 찾을 수 없습니다.' }, { status: 404 })

  return NextResponse.json(q)
}

/**
 * PATCH — 선생님이 문항을 고친다.
 *
 * 보낸 항목만 바뀐다. 내용을 고치면 editedBy 가, 분류를 고치면 classifiedBy 가
 * 선생님 이름으로 남는다. 둘을 따로 두는 이유는 "본문만 고쳤는데 자동 분류까지
 * 잠기는" 일을 막기 위해서다.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const me = await getTeacherAuth(req)
  if (!me) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const { id } = await params
  const existing = await prisma.question.findUnique({ where: { id }, select: { id: true } })
  if (!existing) return NextResponse.json({ error: '문항을 찾을 수 없습니다.' }, { status: 404 })

  const body = await req.json().catch(() => ({})) as Record<string, unknown>

  // ── 내용 ──
  const contentPatch: Record<string, unknown> = {}
  if (typeof body.content === 'string') contentPatch.content = body.content.trim() || null
  if (typeof body.solution === 'string') contentPatch.solution = body.solution.trim() || null
  if (typeof body.title === 'string') contentPatch.title = body.title.trim()
  if (typeof body.answer === 'string') {
    const answer = body.answer.trim()
    if (!answer) return NextResponse.json({ error: '답을 비울 수 없습니다.' }, { status: 400 })
    contentPatch.answer = answer
  }
  if (typeof body.answerType === 'string') {
    if (!['multiple', 'short', 'image'].includes(body.answerType)) {
      return NextResponse.json({ error: 'answerType 이 올바르지 않습니다.' }, { status: 400 })
    }
    contentPatch.answerType = body.answerType
  }

  // ── 분류 ──
  const classPatch: Record<string, unknown> = {}
  if ('difficulty' in body) {
    // null 을 명시적으로 보내면 "안 매김"으로 되돌린다
    classPatch.difficulty = body.difficulty === null ? null : clampDifficulty(body.difficulty)
  }
  for (const key of ['subUnitId', 'patternTypeId', 'conceptNodeId'] as const) {
    if (!(key in body)) continue
    const v = body[key]
    if (v !== null && typeof v !== 'string') {
      return NextResponse.json({ error: `${key} 형식이 올바르지 않습니다.` }, { status: 400 })
    }
    classPatch[key] = v || null
  }
  if (typeof body.variantKind === 'string') {
    if (!VARIANT_KINDS.includes(body.variantKind as VariantKind)) {
      return NextResponse.json({ error: 'variantKind 가 올바르지 않습니다.' }, { status: 400 })
    }
    classPatch.variantKind = body.variantKind
  }

  // 좌표를 바꾸면 실재하는 값인지 확인한다 — 없는 id 를 넣으면 조회에서 조용히 빠진다
  if (typeof classPatch.subUnitId === 'string') {
    const ok = await prisma.mathSubUnit.count({ where: { id: classPatch.subUnitId as string } })
    if (!ok) return NextResponse.json({ error: '그런 소단원이 없습니다.' }, { status: 400 })
  }
  if (typeof classPatch.patternTypeId === 'string') {
    const ok = await prisma.mathPatternType.count({ where: { id: classPatch.patternTypeId as string } })
    if (!ok) return NextResponse.json({ error: '그런 유형이 없습니다.' }, { status: 400 })
  }
  if (typeof classPatch.conceptNodeId === 'string') {
    const ok = await prisma.conceptNode.count({ where: { id: classPatch.conceptNodeId as string } })
    if (!ok) return NextResponse.json({ error: '그런 개념이 없습니다.' }, { status: 400 })
  }

  // ── 오류 표시 ──
  const statusPatch: Record<string, unknown> = {}
  if (typeof body.status === 'string') {
    if (!STATUSES.includes(body.status)) {
      return NextResponse.json(
        { error: `status 는 ${STATUSES.join(' | ')} 중 하나여야 합니다.` }, { status: 400 }
      )
    }
    statusPatch.status = body.status
    // 정상으로 되돌리면 사유도 지운다 — 남겨 두면 화면에 유령 사유가 붙는다
    if (body.status === 'active') statusPatch.flagReason = null
  }
  if (typeof body.flagReason === 'string') statusPatch.flagReason = body.flagReason.trim() || null

  const touchedContent = Object.keys(contentPatch).length > 0
  const touchedClass = Object.keys(classPatch).length > 0
  if (!touchedContent && !touchedClass && Object.keys(statusPatch).length === 0) {
    return NextResponse.json({ error: '바꿀 항목이 없습니다.' }, { status: 400 })
  }

  const updated = await prisma.question.update({
    where: { id },
    data: {
      ...contentPatch,
      ...classPatch,
      ...statusPatch,
      ...(touchedContent ? { editedAt: new Date(), editedBy: me.name } : {}),
      ...(touchedClass ? { classifiedAt: new Date(), classifiedBy: me.name } : {}),
    },
    include: DETAIL,
  })

  return NextResponse.json({
    ok: true,
    question: updated,
    // 화면에서 "이제 반입이 덮어쓰지 않는다"를 알려 줄 수 있게 명시한다
    protectedFromImport: {
      content: updated.editedAt != null,
      classification: updated.classifiedBy != null && updated.classifiedBy !== 'auto',
    },
  })
}
